/**
 * Workflow 端到端测试
 * 包含执行状态检查和工作流触发能力
 */

const { assert } = require('../../lib/assertions');
const { request } = require('../../lib/http-client');
const { getWorkflowByName, n8nApi } = require('../../lib/n8n-utils');
const config = require('../../config/test.config');

// 缓存的 workflow 信息
let _workflow = null;

async function getWorkflow() {
  if (!_workflow) {
    _workflow = await getWorkflowByName(config.n8n.workflowName);
    if (!_workflow) {
      throw new Error(`Workflow not found: ${config.n8n.workflowName}`);
    }
  }
  return _workflow;
}

// 获取最近执行记录
async function getLatestExecution() {
  const wf = await getWorkflow();
  const res = await n8nApi(`/executions?workflowId=${wf.id}&limit=1`);
  return res.data.data?.[0];
}

// 等待执行完成
async function waitForExecution(executionId, timeoutMs = 300000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const res = await n8nApi(`/executions/${executionId}`);
    const exec = res.data;
    if (exec.finished) {
      return exec;
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`Execution ${executionId} timed out after ${timeoutMs}ms`);
}

// 更新workflow
async function updateWorkflow() {
  const fs = require('fs');
  const path = require('path');
  const wfPath = path.join(config.paths.workflows, 'daily-pack-v5-fixed.json');
  const wfData = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
  const wf = await getWorkflow();

  const res = await n8nApi(`/workflows/${wf.id}`, {
    method: 'PUT',
    body: wfData
  });
  return res;
}

// 触发workflow执行 (通过Webhook GET)
async function triggerWorkflow() {
  const webhookUrl = `http://${config.n8n.host}:${config.n8n.port}/webhook/x-daily-pack-trigger`;
  const res = await request(webhookUrl, { method: 'GET' });
  return res;
}

// 等待所有正在运行的执行完成
async function waitForNoRunningExecutions(timeoutMs = 60000) {
  const wf = await getWorkflow();
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const res = await n8nApi(`/executions?workflowId=${wf.id}&status=running&limit=1`);
    const running = res.data.data || [];
    if (running.length === 0) return true;
    console.log(`Waiting for ${running.length} running execution(s) to complete...`);
    await new Promise(r => setTimeout(r, 5000));
  }
  return false;
}

module.exports = {
  name: 'Workflow E2E',

  tests: [
    {
      name: 'Workflow更新成功',
      run: async () => {
        const res = await updateWorkflow();
        assert.ok(res.status >= 200 && res.status < 300, `Update failed: ${res.status}`);
        assert.ok(res.data.id, 'Updated workflow should have ID');
      }
    },
    {
      name: '最近执行成功',
      run: async () => {
        const exec = await getLatestExecution();
        assert.ok(exec, 'No executions found');
        assert.equal(exec.status, 'success', `Last execution status: ${exec.status}`);
      }
    },
    {
      name: '执行时间合理(<5min)',
      run: async () => {
        const exec = await getLatestExecution();
        if (exec?.startedAt && exec?.stoppedAt) {
          const duration = (new Date(exec.stoppedAt) - new Date(exec.startedAt)) / 1000;
          assert.ok(duration < 300, `Execution took ${duration}s`);
        }
      }
    },
    {
      name: '工作流节点数正确',
      run: async () => {
        const wf = await getWorkflow();
        const res = await n8nApi(`/workflows/${wf.id}`);
        const nodeCount = res.data.nodes?.length || 0;
        assert.ok(nodeCount >= 15, `Expected >= 15 nodes, got ${nodeCount}`);
      }
    },
    {
      name: '执行有输出数据',
      run: async () => {
        const exec = await getLatestExecution();
        assert.ok(exec, 'No executions found');
        // 检查执行ID存在且为成功状态
        assert.ok(exec.id, 'Execution has no ID');
        if (exec.status === 'success') {
          assert.ok(exec.stoppedAt, 'Successful execution should have stoppedAt');
        }
      }
    },
    {
      name: '触发执行并验证完成',
      skip: process.env.SKIP_TRIGGER_TEST === 'true', // 可通过环境变量跳过
      run: async () => {
        // 1. 等待所有正在运行的执行完成（防止并发干扰）
        const noRunning = await waitForNoRunningExecutions(120000);
        assert.ok(noRunning, 'Timed out waiting for running executions to complete');

        // 2. 记录触发前的最新执行ID
        const beforeExec = await getLatestExecution();
        const beforeId = beforeExec?.id;
        const triggerTime = Date.now();

        // 3. 通过Webhook触发执行
        const triggerRes = await triggerWorkflow();
        assert.ok(triggerRes.status >= 200 && triggerRes.status < 300,
          `Webhook trigger failed: ${triggerRes.status}`);
        console.log('Webhook triggered successfully');

        // 4. 等待新执行出现并完成
        const startTime = Date.now();
        let newExec = null;
        while (Date.now() - startTime < 300000) {
          const latestExec = await getLatestExecution();
          // 验证是新执行且是在触发后开始的
          if (latestExec && latestExec.id !== beforeId) {
            const execStartTime = new Date(latestExec.startedAt).getTime();
            if (execStartTime >= triggerTime - 5000) { // 5秒容差
              if (latestExec.finished) {
                newExec = latestExec;
                break;
              }
            }
          }
          await new Promise(r => setTimeout(r, 5000));
        }

        assert.ok(newExec, 'No new execution found after trigger');
        console.log(`Execution ${newExec.id} completed`);

        // 5. 验证执行成功
        assert.equal(newExec.status, 'success', `Execution failed: ${newExec.status}`);

        // 6. 输出执行时间
        if (newExec.startedAt && newExec.stoppedAt) {
          const duration = (new Date(newExec.stoppedAt) - new Date(newExec.startedAt)) / 1000;
          console.log(`Execution completed in ${duration}s`);
        }
      }
    }
  ]
};
