/**
 * n8n API 集成测试
 */

const { assert } = require('../../lib/assertions');
const { request } = require('../../lib/http-client');
const config = require('../../config/test.config');

function n8nApi(endpoint) {
  return request(`http://${config.n8n.host}:${config.n8n.port}/api/v1${endpoint}`, {
    headers: { 'X-N8N-API-KEY': config.n8n.apiKey }
  });
}

module.exports = {
  name: 'n8n API',

  tests: [
    {
      name: 'API Key配置',
      run: async () => {
        assert.ok(config.n8n.apiKey, 'Missing N8N_API_KEY');
      }
    },
    {
      name: 'API连接',
      run: async () => {
        const res = await n8nApi('/workflows');
        assert.equal(res.status, 200);
      }
    },
    {
      name: 'Workflow存在',
      run: async () => {
        const res = await n8nApi('/workflows');
        const workflows = res.data.data || [];
        const found = workflows.find(w => w.name.includes('Daily Pack'));
        assert.ok(found, 'Daily Pack workflow not found');
      }
    },
    {
      name: 'Workflow已激活',
      run: async () => {
        const res = await n8nApi('/workflows');
        const workflows = res.data.data || [];
        const found = workflows.find(w => w.name.includes('Daily Pack'));
        assert.ok(found?.active, 'Workflow not active');
      }
    },
    {
      name: '执行历史可访问',
      run: async () => {
        const res = await n8nApi('/executions?limit=1');
        assert.equal(res.status, 200);
        assert.isArray(res.data.data);
      }
    }
  ]
};
