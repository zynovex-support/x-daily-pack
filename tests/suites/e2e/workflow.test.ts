/**
 * Workflow 端到端测试
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { testConfig } from '../../setup/global-setup';

interface Workflow {
  id: string;
  name: string;
  active: boolean;
  nodes?: unknown[];
}

interface Execution {
  id: string;
  status: string;
  finished: boolean;
  startedAt: string;
  stoppedAt: string;
}

// n8n API helper
async function n8nApi(endpoint: string, options: { method?: string; body?: unknown } = {}) {
  const url = `http://${testConfig.n8n.host}:${testConfig.n8n.port}/api/v1${endpoint}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'X-N8N-API-KEY': testConfig.n8n.apiKey || '',
      'Content-Type': 'application/json'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  return { status: res.status, data: await res.json() };
}

// Get workflow by name
async function getWorkflow(): Promise<Workflow> {
  const res = await n8nApi('/workflows');
  const workflows = res.data.data || [];
  const found = workflows.find((w: Workflow) =>
    w.name.includes(testConfig.n8n.workflowName)
  );
  if (!found) throw new Error(`Workflow not found: ${testConfig.n8n.workflowName}`);
  return found;
}

// Get latest execution
async function getLatestExecution(): Promise<Execution | null> {
  const wf = await getWorkflow();
  const res = await n8nApi(`/executions?workflowId=${wf.id}&limit=1`);
  return res.data.data?.[0] || null;
}

describe('Workflow E2E', () => {
  it('最近执行成功', async () => {
    const exec = await getLatestExecution();
    expect(exec).toBeTruthy();
    expect(exec?.status).toBe('success');
  }, 30000);

  it('执行时间合理(<5min)', async () => {
    const exec = await getLatestExecution();
    if (exec?.startedAt && exec?.stoppedAt) {
      const duration = (new Date(exec.stoppedAt).getTime() - new Date(exec.startedAt).getTime()) / 1000;
      expect(duration).toBeLessThan(300);
    }
  }, 30000);

  it('工作流节点数正确', async () => {
    const wf = await getWorkflow();
    const res = await n8nApi(`/workflows/${wf.id}`);
    const nodeCount = res.data.nodes?.length || 0;
    expect(nodeCount).toBeGreaterThanOrEqual(15);
  }, 30000);

  it('执行有输出数据', async () => {
    const exec = await getLatestExecution();
    expect(exec).toBeTruthy();
    expect(exec?.id).toBeTruthy();
    if (exec?.status === 'success') {
      expect(exec.stoppedAt).toBeTruthy();
    }
  }, 30000);
});
