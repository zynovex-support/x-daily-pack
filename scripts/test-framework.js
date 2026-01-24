#!/usr/bin/env node
/**
 * X Daily Pack - 自动化测试框架
 * 用于验证 workflow 配置和执行
 *
 * 使用: node scripts/test-framework.js [test-name]
 * 示例: node scripts/test-framework.js all
 *       node scripts/test-framework.js rss
 *       node scripts/test-framework.js workflow
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const CONFIG = {
  n8n: {
    host: process.env.N8N_HOST || 'localhost',
    port: process.env.N8N_PORT || 5678,
    apiKey: process.env.N8N_API_KEY
  },
  logDir: path.join(__dirname, '..', 'logs', 'tests'),
  configDir: path.join(__dirname, '..', 'config')
};

// 确保日志目录存在
if (!fs.existsSync(CONFIG.logDir)) {
  fs.mkdirSync(CONFIG.logDir, { recursive: true });
}

// 日志工具
const log = {
  file: null,
  init(testName) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.file = path.join(CONFIG.logDir, `${testName}-${timestamp}.log`);
    this.write(`=== Test Started: ${testName} ===`);
    this.write(`Timestamp: ${new Date().toISOString()}`);
  },
  write(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(msg);
    if (this.file) {
      fs.appendFileSync(this.file, line + '\n');
    }
  },
  success(msg) { this.write(`✅ ${msg}`); },
  error(msg) { this.write(`❌ ${msg}`); },
  info(msg) { this.write(`ℹ️  ${msg}`); },
  warn(msg) { this.write(`⚠️  ${msg}`); }
};

// HTTP 请求工具
function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const client = options.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
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

// n8n API 请求
async function n8nApi(endpoint, method = 'GET', data = null) {
  const options = {
    hostname: CONFIG.n8n.host,
    port: CONFIG.n8n.port,
    path: `/api/v1${endpoint}`,
    method,
    headers: {
      'X-N8N-API-KEY': CONFIG.n8n.apiKey,
      'Content-Type': 'application/json'
    }
  };
  return request(options, data);
}

module.exports = { CONFIG, log, request, n8nApi };
