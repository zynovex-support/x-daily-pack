const fs = require('fs');
const wfPath = 'workflows/daily-pack-v5-fixed.json';
const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));

// Webhook触发器节点配置
const webhookNode = {
  parameters: {
    path: 'x-daily-pack-trigger',
    responseMode: 'onReceived',
    options: {}
  },
  name: 'Webhook Trigger',
  type: 'n8n-nodes-base.webhook',
  typeVersion: 2,
  position: [0, 300],
  id: 'webhook-trigger',
  webhookId: 'x-daily-pack-trigger'
};

// 检查是否已存在
const exists = wf.nodes.some(n => n.name === 'Webhook Trigger');
if (exists) {
  console.log('Webhook Trigger already exists');
  process.exit(0);
}

// 添加节点
wf.nodes.unshift(webhookNode);

// 复制Manual Trigger的连接到Webhook Trigger
if (wf.connections['Manual Trigger']) {
  wf.connections['Webhook Trigger'] = JSON.parse(
    JSON.stringify(wf.connections['Manual Trigger'])
  );
}

fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2));
console.log('Added Webhook Trigger node');
console.log('Webhook URL: http://localhost:5678/webhook/x-daily-pack-trigger');
