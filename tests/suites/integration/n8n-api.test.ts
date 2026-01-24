/**
 * n8n API 集成测试
 */
import { describe, it, expect } from 'vitest';
import { testConfig } from '../../setup/global-setup';

async function n8nApi(endpoint: string) {
  const url = `http://${testConfig.n8n.host}:${testConfig.n8n.port}/api/v1${endpoint}`;
  const response = await fetch(url, {
    headers: { 'X-N8N-API-KEY': testConfig.n8n.apiKey || '' }
  });
  return {
    status: response.status,
    data: await response.json()
  };
}

describe('n8n API', () => {
  it('API Key配置', () => {
    expect(testConfig.n8n.apiKey).toBeTruthy();
  });

  it('API连接', async () => {
    const res = await n8nApi('/workflows');
    expect(res.status).toBe(200);
  });

  it('Workflow存在', async () => {
    const res = await n8nApi('/workflows');
    const workflows = res.data.data || [];
    const found = workflows.find((w: { name: string }) =>
      w.name.includes('Daily Pack')
    );
    expect(found).toBeTruthy();
  });

  it('Workflow已激活', async () => {
    const res = await n8nApi('/workflows');
    const workflows = res.data.data || [];
    const found = workflows.find((w: { name: string }) =>
      w.name.includes('Daily Pack')
    );
    expect(found?.active).toBe(true);
  });

  it('执行历史可访问', async () => {
    const res = await n8nApi('/executions?limit=1');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);
  });
});
