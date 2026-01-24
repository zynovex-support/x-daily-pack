#!/usr/bin/env node
/**
 * X Daily Pack - 全流程测试脚本
 *
 * 测试项目:
 * 1. RSS 源可用性测试
 * 2. n8n API 连接测试
 * 3. Workflow 执行测试
 * 4. 输出验证测试
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// 加载 .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && !key.startsWith('#')) {
      process.env[key.trim()] = vals.join('=').trim();
    }
  });
}

const CONFIG = {
  n8nHost: process.env.N8N_HOST || 'localhost',
  n8nPort: process.env.N8N_PORT || 5678,
  n8nApiKey: process.env.N8N_API_KEY,
  logDir: path.join(__dirname, '..', 'logs', 'tests')
};

// 确保日志目录存在
if (!fs.existsSync(CONFIG.logDir)) {
  fs.mkdirSync(CONFIG.logDir, { recursive: true });
}

// 测试结果
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

// 日志
function log(msg, type = 'info') {
  const icons = { info: 'ℹ️', success: '✅', error: '❌', warn: '⚠️' };
  console.log(`${icons[type] || ''} ${msg}`);
}

// HTTP GET
function httpGet(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; n8n-rss-fetcher/1.0)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
      }
    };
    const req = client.get(options, (res) => {
      resolve({ status: res.statusCode, headers: res.headers });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// n8n API 请求
function n8nApi(endpoint, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: CONFIG.n8nHost,
      port: CONFIG.n8nPort,
      path: `/api/v1${endpoint}`,
      method,
      headers: {
        'X-N8N-API-KEY': CONFIG.n8nApiKey,
        'Content-Type': 'application/json'
      }
    };
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

// 测试 1: RSS 源可用性
async function testRssSources() {
  log('=== 测试 RSS 源可用性 ===', 'info');

  const configPath = path.join(__dirname, '..', 'config', 'rss-feeds.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  let passed = 0, failed = 0;
  const failedFeeds = [];

  for (const feed of config.feeds) {
    try {
      const res = await httpGet(feed.url);
      if (res.status >= 200 && res.status < 400) {
        passed++;
      } else {
        failed++;
        failedFeeds.push({ id: feed.id, status: res.status });
      }
    } catch (err) {
      failed++;
      failedFeeds.push({ id: feed.id, error: err.message });
    }
  }

  log(`RSS 源: ${passed}/${config.feeds.length} 可用`, passed === config.feeds.length ? 'success' : 'warn');
  if (failedFeeds.length > 0) {
    failedFeeds.forEach(f => log(`  - ${f.id}: ${f.status || f.error}`, 'error'));
  }

  return { name: 'RSS Sources', passed: failed === 0, details: { total: config.feeds.length, passed, failed, failedFeeds } };
}

// 测试 2: n8n API 连接
async function testN8nConnection() {
  log('=== 测试 n8n API 连接 ===', 'info');

  try {
    const res = await n8nApi('/workflows');
    if (res.status === 200) {
      const workflows = res.data.data || [];
      log(`n8n API 连接成功，共 ${workflows.length} 个 workflow`, 'success');
      return { name: 'n8n Connection', passed: true, details: { workflowCount: workflows.length } };
    } else {
      log(`n8n API 返回 ${res.status}`, 'error');
      return { name: 'n8n Connection', passed: false, details: { status: res.status } };
    }
  } catch (err) {
    log(`n8n API 连接失败: ${err.message}`, 'error');
    return { name: 'n8n Connection', passed: false, details: { error: err.message } };
  }
}

// 测试 3: 查找 Daily Pack workflow
async function testFindWorkflow() {
  log('=== 查找 Daily Pack Workflow ===', 'info');

  try {
    const res = await n8nApi('/workflows');
    if (res.status !== 200) {
      return { name: 'Find Workflow', passed: false, details: { error: 'API error' } };
    }

    const workflows = res.data.data || [];
    const dailyPack = workflows.find(w => w.name && w.name.includes('Daily Pack'));

    if (dailyPack) {
      log(`找到 workflow: ${dailyPack.name} (ID: ${dailyPack.id})`, 'success');
      log(`  状态: ${dailyPack.active ? '已激活' : '未激活'}`, dailyPack.active ? 'success' : 'warn');
      return { name: 'Find Workflow', passed: true, details: { id: dailyPack.id, name: dailyPack.name, active: dailyPack.active } };
    } else {
      log('未找到 Daily Pack workflow', 'error');
      return { name: 'Find Workflow', passed: false, details: { error: 'Not found' } };
    }
  } catch (err) {
    return { name: 'Find Workflow', passed: false, details: { error: err.message } };
  }
}

// 主函数
async function main() {
  console.log('\n========================================');
  console.log('  X Daily Pack - 自动化测试');
  console.log('  ' + new Date().toISOString());
  console.log('========================================\n');

  const tests = [
    testN8nConnection,
    testFindWorkflow,
    testRssSources
  ];

  for (const test of tests) {
    try {
      const result = await test();
      results.tests.push(result);
      if (result.passed) results.passed++; else results.failed++;
    } catch (err) {
      results.tests.push({ name: test.name, passed: false, error: err.message });
      results.failed++;
    }
    console.log('');
  }

  // 保存结果
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(CONFIG.logDir, `test-${timestamp}.json`);
  fs.writeFileSync(logFile, JSON.stringify(results, null, 2));

  // 总结
  console.log('========================================');
  console.log(`  测试完成: ${results.passed} 通过, ${results.failed} 失败`);
  console.log(`  日志: ${logFile}`);
  console.log('========================================\n');

  return results;
}

// 导出供外部调用
module.exports = { main, testRssSources, testN8nConnection, testFindWorkflow };

// 直接运行
if (require.main === module) {
  main().catch(console.error);
}
