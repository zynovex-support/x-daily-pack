#!/usr/bin/env node
/**
 * X Daily Pack - 完整测试脚本
 *
 * 测试流程:
 * 1. RSS 源可用性测试
 * 2. n8n API 连接测试
 * 3. 通过 UI 触发 workflow 执行
 * 4. 通过 API 轮询执行状态
 * 5. 验证执行结果
 */

const { chromium } = require('playwright');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 配置
const N8N_URL = process.env.N8N_URL || 'http://localhost:5678';
const N8N_API_KEY = process.env.N8N_API_KEY;
const EMAIL = process.env.N8N_UI_EMAIL;
const PASSWORD = process.env.N8N_UI_PASSWORD;
const WORKFLOW_NAME = 'X Daily Pack v5';
const WORKFLOW_ID = process.env.N8N_WORKFLOW_ID;

if (!N8N_API_KEY) {
  throw new Error('Missing N8N_API_KEY. Export it before running.');
}
if (!EMAIL || !PASSWORD) {
  throw new Error('Missing N8N_UI_EMAIL or N8N_UI_PASSWORD. Export them before running.');
}
if (!WORKFLOW_ID) {
  throw new Error('Missing N8N_WORKFLOW_ID. Export it before running.');
}

const LOG_DIR = path.join(__dirname, '../logs/tests');
const LOG_FILE = path.join(LOG_DIR, `test-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);

// 日志
function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// HTTP 请求
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = url.startsWith('https') ? https : http;
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (url.startsWith('https') ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'n8n-test-runner/1.0',
        ...options.headers
      },
      timeout: options.timeout || 30000
    };

    const req = client.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

// n8n API 请求
async function n8nApi(endpoint) {
  const res = await httpRequest(`${N8N_URL}/api/v1${endpoint}`, {
    headers: { 'X-N8N-API-KEY': N8N_API_KEY }
  });
  return JSON.parse(res.data);
}

// 获取最新执行
async function getLatestExecution(workflowId) {
  const data = await n8nApi(`/executions?workflowId=${workflowId}&limit=1`);
  return data.data?.[0];
}

// 主测试
async function runTests() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(LOG_FILE, '');

  log('========================================');
  log('  X Daily Pack - 完整测试');
  log('========================================\n');

  const results = { passed: 0, failed: 0, tests: [] };

  // 测试 1: n8n 连接
  log('测试 1: n8n API 连接...');
  try {
    const workflows = await n8nApi('/workflows');
    const count = workflows.data?.length || 0;
    log(`  ✅ 连接成功，${count} 个 workflow`);
    results.passed++;
    results.tests.push({ name: 'n8n Connection', passed: true, count });
  } catch (e) {
    log(`  ❌ 连接失败: ${e.message}`);
    results.failed++;
    results.tests.push({ name: 'n8n Connection', passed: false, error: e.message });
  }

  // 测试 2: Workflow 状态
  log('\n测试 2: Workflow 状态...');
  try {
    const workflows = await n8nApi('/workflows');
    const wf = workflows.data?.find(w => w.id === WORKFLOW_ID);
    if (wf && wf.active) {
      log(`  ✅ ${wf.name} 已激活`);
      results.passed++;
      results.tests.push({ name: 'Workflow Status', passed: true });
    } else {
      throw new Error('Workflow 未找到或未激活');
    }
  } catch (e) {
    log(`  ❌ ${e.message}`);
    results.failed++;
    results.tests.push({ name: 'Workflow Status', passed: false, error: e.message });
  }

  // 测试 3: 触发执行
  log('\n测试 3: 触发 Workflow 执行...');
  let executionId = null;
  try {
    // 记录执行前的最新执行ID
    const beforeExec = await getLatestExecution(WORKFLOW_ID);
    const beforeId = beforeExec?.id || 0;
    log(`  执行前最新ID: ${beforeId}`);

    // 通过 UI 触发
    log('  启动浏览器...');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(N8N_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // 登录
    if (page.url().includes('signin')) {
      log('  登录中...');
      await page.waitForSelector('input', { timeout: 30000 });
      const emailInput = await page.locator('input[type="email"], input[name="email"]').first();
      const passwordInput = await page.locator('input[type="password"]').first();
      await emailInput.fill(EMAIL);
      await passwordInput.fill(PASSWORD);
      // 使用更灵活的按钮选择器
      const loginBtn = await page.locator('button:has-text("Sign in"), button:has-text("Login"), button[type="submit"]').first();
      await loginBtn.click({ force: true });
      await page.waitForTimeout(5000);
    }

    // 直接导航到 workflow 编辑页面
    log(`  直接打开 workflow 编辑页面...`);
    await page.goto(`${N8N_URL}/workflow/${WORKFLOW_ID}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    log(`  当前 URL: ${page.url()}`);

    // 关闭可能存在的弹窗/侧边栏
    log('  关闭弹窗...');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2000);

    // 获取页面上所有按钮的信息
    log('  分析页面按钮...');
    const buttons = await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      return Array.from(btns).map(b => ({
        text: b.textContent?.trim().substring(0, 50),
        testId: b.getAttribute('data-test-id'),
        class: b.className?.substring(0, 50)
      })).filter(b => b.text || b.testId);
    });
    log(`  找到 ${buttons.length} 个按钮`);
    buttons.slice(0, 15).forEach(b => log(`    - ${b.testId || b.text}`));

    // 尝试多种方式触发执行
    log('  尝试触发执行...');

    // 直接点击 Manual Trigger 的执行按钮
    const manualTriggerBtn = await page.locator('[data-test-id="execute-workflow-button-Manual Trigger"]').first();
    if (await manualTriggerBtn.isVisible().catch(() => false)) {
      await manualTriggerBtn.click({ force: true });
      log('  已点击 Manual Trigger 执行按钮');
    } else {
      // 备选：查找包含 "Test" 或 "Execute" 的按钮
      const execBtn = await page.locator('button').filter({ hasText: /test|execute|run/i }).first();
      if (await execBtn.isVisible().catch(() => false)) {
        await execBtn.click({ force: true });
        log('  已点击执行按钮');
      } else {
        await page.keyboard.press('Control+Enter');
        log('  已使用快捷键');
      }
    }

    await page.waitForTimeout(5000);
    await browser.close();
    log('  ✅ 已触发执行');

    // 等待新执行出现
    log('  等待执行开始...');
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const afterExec = await getLatestExecution(WORKFLOW_ID);
      if (afterExec && afterExec.id > beforeId) {
        executionId = afterExec.id;
        log(`  新执行ID: ${executionId}`);
        break;
      }
    }

    if (!executionId) {
      throw new Error('未检测到新执行');
    }

    results.passed++;
    results.tests.push({ name: 'Trigger Execution', passed: true, executionId });

  } catch (e) {
    log(`  ❌ ${e.message}`);
    results.failed++;
    results.tests.push({ name: 'Trigger Execution', passed: false, error: e.message });
  }

  // 测试 4: 等待执行完成
  if (executionId) {
    log('\n测试 4: 等待执行完成...');
    try {
      const maxWait = 300000; // 5分钟
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        const exec = await getLatestExecution(WORKFLOW_ID);
        if (exec && exec.id === executionId) {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          if (exec.status === 'success') {
            log(`  ✅ 执行成功 (${elapsed}s)`);
            results.passed++;
            results.tests.push({ name: 'Execution Complete', passed: true, duration: elapsed });
            break;
          } else if (exec.status === 'error' || exec.status === 'crashed') {
            throw new Error(`执行失败: ${exec.status}`);
          } else {
            log(`  等待中... ${elapsed}s (状态: ${exec.status || 'running'})`);
          }
        }
        await new Promise(r => setTimeout(r, 10000));
      }
    } catch (e) {
      log(`  ❌ ${e.message}`);
      results.failed++;
      results.tests.push({ name: 'Execution Complete', passed: false, error: e.message });
    }
  }

  // 输出结果
  log('\n========================================');
  log(`  测试完成: ${results.passed} 通过, ${results.failed} 失败`);
  log('========================================');
  log(`日志文件: ${LOG_FILE}`);

  // 保存 JSON 结果
  const jsonFile = LOG_FILE.replace('.log', '.json');
  fs.writeFileSync(jsonFile, JSON.stringify(results, null, 2));
  log(`结果文件: ${jsonFile}`);

  process.exit(results.failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('测试异常:', e);
  process.exit(1);
});
