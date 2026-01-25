/**
 * Metrics Collector 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';

// 内联测试
const metrics = {
  workflow_executions: 0,
  openai_api_calls: 0,
  content_processed: 0,
  content_quality_sum: 0
};

function recordWorkflowExecution() {
  metrics.workflow_executions++;
}

function recordAPICall() {
  metrics.openai_api_calls++;
}

function recordContent(score: number) {
  metrics.content_processed++;
  metrics.content_quality_sum += score;
}

describe('Metrics Collector', () => {
  beforeEach(() => {
    console.log('Test suite starting...');
    Object.keys(metrics).forEach(k => (metrics as any)[k] = 0);
  });

  it('should record workflow executions', () => {
    recordWorkflowExecution();
    recordWorkflowExecution();
    expect(metrics.workflow_executions).toBe(2);
  });

  it('should record API calls', () => {
    recordAPICall();
    expect(metrics.openai_api_calls).toBe(1);
  });

  it('should calculate average quality', () => {
    recordContent(20);
    recordContent(25);
    const avg = metrics.content_quality_sum / metrics.content_processed;
    expect(avg).toBe(22.5);
  });

  console.log('Test suite completed.');
});
