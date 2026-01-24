/**
 * Feedback Storage Module
 * 管理用户反馈数据的存储和读取
 *
 * 数据结构：
 * - feedbackHistory: 反馈记录列表
 * - learnedWeights: 学习到的权重
 */

// 配置参数
const MAX_FEEDBACK_HISTORY = 500;  // 最大反馈记录数
const FEEDBACK_EXPIRY_DAYS = 30;   // 反馈过期天数

/**
 * 初始化存储
 */
function initStorage(staticData) {
  if (!staticData.feedbackHistory) {
    staticData.feedbackHistory = [];
  }
  if (!staticData.learnedWeights) {
    staticData.learnedWeights = {
      version: 1,
      updated_at: null,
      categoryBoosts: {},
      sourceBoosts: {}
    };
  }
  return staticData;
}

/**
 * 记录反馈
 */
function recordFeedback(staticData, feedback) {
  const { userId, action, tweetOption, sourceArticles, tweetText } = feedback;

  const record = {
    feedbackId: `fb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    userId: userId || 'unknown',
    action: action,  // 'approved' | 'ignored'
    tweetOption: tweetOption || null,
    sourceArticles: (sourceArticles || []).map(a => ({
      url: a.url,
      title: a.title,
      source: a.source,
      category: a.category || a.score?.category || 'unknown'
    })),
    tweetText: tweetText || ''
  };

  staticData.feedbackHistory.push(record);

  // 清理过期记录
  cleanExpiredFeedback(staticData);

  // 限制记录数量
  if (staticData.feedbackHistory.length > MAX_FEEDBACK_HISTORY) {
    staticData.feedbackHistory = staticData.feedbackHistory.slice(-MAX_FEEDBACK_HISTORY);
  }

  return record;
}

/**
 * 清理过期反馈
 */
function cleanExpiredFeedback(staticData) {
  const now = Date.now();
  const expiryMs = FEEDBACK_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

  const before = staticData.feedbackHistory.length;
  staticData.feedbackHistory = staticData.feedbackHistory.filter(
    f => (now - f.timestamp) < expiryMs
  );

  return before - staticData.feedbackHistory.length;
}

/**
 * 获取反馈统计
 */
function getFeedbackStats(staticData) {
  const history = staticData.feedbackHistory || [];

  const stats = {
    total: history.length,
    approved: 0,
    ignored: 0,
    byCategory: {},
    bySource: {},
    last7Days: 0,
    last30Days: 0
  };

  const now = Date.now();
  const day7 = 7 * 24 * 60 * 60 * 1000;
  const day30 = 30 * 24 * 60 * 60 * 1000;

  history.forEach(f => {
    // 统计 approved/ignored
    if (f.action === 'approved') stats.approved++;
    else if (f.action === 'ignored') stats.ignored++;

    // 时间统计
    const age = now - f.timestamp;
    if (age < day7) stats.last7Days++;
    if (age < day30) stats.last30Days++;

    // 分类统计
    (f.sourceArticles || []).forEach(a => {
      const cat = a.category || 'unknown';
      const src = a.source || 'unknown';

      if (!stats.byCategory[cat]) {
        stats.byCategory[cat] = { approved: 0, ignored: 0 };
      }
      if (!stats.bySource[src]) {
        stats.bySource[src] = { approved: 0, ignored: 0 };
      }

      if (f.action === 'approved') {
        stats.byCategory[cat].approved++;
        stats.bySource[src].approved++;
      } else {
        stats.byCategory[cat].ignored++;
        stats.bySource[src].ignored++;
      }
    });
  });

  return stats;
}

/**
 * 保存学习权重
 */
function saveLearnedWeights(staticData, weights) {
  staticData.learnedWeights = {
    ...weights,
    version: (staticData.learnedWeights?.version || 0) + 1,
    updated_at: Date.now()
  };
  return staticData.learnedWeights;
}

/**
 * 获取学习权重
 */
function getLearnedWeights(staticData) {
  return staticData.learnedWeights || {
    version: 0,
    updated_at: null,
    categoryBoosts: {},
    sourceBoosts: {}
  };
}

// 导出函数
module.exports = {
  initStorage,
  recordFeedback,
  cleanExpiredFeedback,
  getFeedbackStats,
  saveLearnedWeights,
  getLearnedWeights,
  MAX_FEEDBACK_HISTORY,
  FEEDBACK_EXPIRY_DAYS
};
