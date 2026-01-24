/**
 * Feedback Recorder Node
 * 记录用户审批行为到 staticData
 *
 * 输入: 来自 Process Slack Commands 的结果
 * 输出: 原样传递，同时记录反馈
 */

const items = $input.all();
const DEBUG = $env.FEEDBACK_DEBUG === 'true';
const ENABLED = $env.FEEDBACK_LEARNING_ENABLED !== 'false';

if (!ENABLED) {
  console.log('[FeedbackRecorder] Disabled');
  return items;
}

// 获取 staticData
let storage;
try {
  storage = this.getWorkflowStaticData
    ? this.getWorkflowStaticData('global')
    : this.helpers?.getWorkflowStaticData?.call(this, 'global');
} catch (err) {
  console.log('[FeedbackRecorder] Cannot access staticData:', err.message);
  return items;
}

if (!storage) {
  console.log('[FeedbackRecorder] staticData not available');
  return items;
}

// 初始化存储结构
if (!storage.feedbackHistory) storage.feedbackHistory = [];
if (!storage.learnedWeights) {
  storage.learnedWeights = {
    version: 1,
    updated_at: null,
    categoryBoosts: {},
    sourceBoosts: {}
  };
}

const MAX_HISTORY = 500;
const EXPIRY_DAYS = 30;
const now = Date.now();

// 清理过期记录
const expiryMs = EXPIRY_DAYS * 24 * 60 * 60 * 1000;
storage.feedbackHistory = storage.feedbackHistory.filter(
  f => (now - f.timestamp) < expiryMs
);

// 处理输入项，记录反馈
let recorded = 0;

for (const item of items) {
  const data = item.json || {};

  // 只处理有效的审批结果
  if (!data.status || data.status === 'noop' || data.status === 'debug') {
    continue;
  }

  // 确定反馈类型
  let action = null;
  if (data.status === 'posted' || data.status === 'dry_run') {
    action = 'approved';
  } else if (data.status === 'skipped_ack' || data.status === 'skipped_seen') {
    continue; // 跳过已处理的
  }
  // ignored 状态需要单独的定时任务来检测（24小时无操作）

  if (!action) continue;

  // 创建反馈记录
  const feedback = {
    feedbackId: `fb_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now,
    userId: data.user_id || 'unknown',
    action: action,
    tweetOption: data.option || null,
    threadTs: data.thread_ts || null,
    commandTs: data.command_ts || null,
    sourceArticles: [] // 需要从 pack 消息中提取
  };

  storage.feedbackHistory.push(feedback);
  recorded++;

  if (DEBUG) {
    console.log(`[FeedbackRecorder] Recorded: ${action} option=${data.option}`);
  }
}

// 限制历史记录数量
if (storage.feedbackHistory.length > MAX_HISTORY) {
  storage.feedbackHistory = storage.feedbackHistory.slice(-MAX_HISTORY);
}

console.log(`[FeedbackRecorder] Recorded ${recorded} feedback, total ${storage.feedbackHistory.length}`);

return items;
