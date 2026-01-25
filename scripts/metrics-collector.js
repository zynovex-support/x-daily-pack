/**
 * Metrics Collector - 指标收集器
 * Phase 4: 监控可观测性
 */

// 指标存储
const metrics = {
  workflow_executions: 0,
  workflow_duration_sum: 0,
  openai_api_calls: 0,
  openai_api_cost: 0,
  content_processed: 0,
  content_quality_sum: 0,
  errors: 0
};

/**
 * 记录工作流执行
 */
function recordWorkflowExecution(durationMs) {
  metrics.workflow_executions++;
  metrics.workflow_duration_sum += durationMs / 1000;
}

/**
 * 记录 API 调用
 */
function recordAPICall(cost = 0) {
  metrics.openai_api_calls++;
  metrics.openai_api_cost += cost;
}

/**
 * 记录内容处理
 */
function recordContent(qualityScore) {
  metrics.content_processed++;
  metrics.content_quality_sum += qualityScore;
}

/**
 * 记录错误
 */
function recordError() {
  metrics.errors++;
}

/**
 * 获取 Prometheus 格式指标
 */
function getPrometheusMetrics() {
  const avgQuality = metrics.content_processed > 0
    ? metrics.content_quality_sum / metrics.content_processed
    : 0;

  return `# HELP workflow_executions_total Total workflow executions
# TYPE workflow_executions_total counter
workflow_executions_total ${metrics.workflow_executions}

# HELP workflow_duration_seconds_sum Total workflow duration
# TYPE workflow_duration_seconds_sum counter
workflow_duration_seconds_sum ${metrics.workflow_duration_sum.toFixed(2)}

# HELP openai_api_calls_total Total OpenAI API calls
# TYPE openai_api_calls_total counter
openai_api_calls_total ${metrics.openai_api_calls}

# HELP openai_api_cost_usd Total API cost in USD
# TYPE openai_api_cost_usd gauge
openai_api_cost_usd ${metrics.openai_api_cost.toFixed(4)}

# HELP content_processed_total Total content items processed
# TYPE content_processed_total counter
content_processed_total ${metrics.content_processed}

# HELP content_quality_score_avg Average content quality score
# TYPE content_quality_score_avg gauge
content_quality_score_avg ${avgQuality.toFixed(2)}

# HELP errors_total Total errors
# TYPE errors_total counter
errors_total ${metrics.errors}
`;
}

/**
 * 重置指标
 */
function resetMetrics() {
  Object.keys(metrics).forEach(k => metrics[k] = 0);
}

module.exports = {
  recordWorkflowExecution,
  recordAPICall,
  recordContent,
  recordError,
  getPrometheusMetrics,
  resetMetrics,
  metrics
};
