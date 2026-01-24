#!/usr/bin/env node
/**
 * 同步 RSS 配置到 workflow JSON
 * 从 scripts/rss-fetch-node.js 读取最新配置，更新到 workflow JSON
 */

const fs = require('fs');
const path = require('path');

const scriptPath = path.join(__dirname, 'rss-fetch-node.js');
const workflowPath = path.join(__dirname, '..', 'workflows', 'daily-pack-v5-fixed.json');

// 读取脚本内容
const scriptContent = fs.readFileSync(scriptPath, 'utf8');

// 读取 workflow
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

// 找到 RSS Fetch 节点
const rssFetchNode = workflow.nodes.find(n => n.name === 'RSS Fetch All');
if (!rssFetchNode) {
  console.error('未找到 RSS Fetch All 节点');
  process.exit(1);
}

// 更新 jsCode
rssFetchNode.parameters.jsCode = scriptContent;

// 保存
fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2));
console.log('✅ Workflow 已更新');
console.log(`   节点: ${rssFetchNode.name}`);
console.log(`   文件: ${workflowPath}`);
