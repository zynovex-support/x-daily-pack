/**
 * Feedback Learning Module
 * 根据用户反馈历史计算权重调整
 *
 * 学习算法：
 * - 统计各分类/来源的 approved/ignored 比率
 * - 计算偏好权重 boost
 * - 应用衰减防止过拟合
 */

// 配置参数
const LEARNING_RATE = 0.1;      // 学习速率
const DECAY_RATE = 0.95;        // 每日衰减率
const MIN_SAMPLES = 5;          // 最少样本数
const WEIGHT_BOUNDS = [-3, 3];  // 权重边界
const BASELINE_RATE = 0.33;     // 基准通过率（3选1）

/**
 * 计算分类偏好权重
 */
function calculateCategoryBoosts(feedbackHistory) {
  const stats = {};

  // 统计各分类的 approved/ignored
  feedbackHistory.forEach(f => {
    (f.sourceArticles || []).forEach(a => {
      const cat = a.category || 'unknown';
      if (!stats[cat]) stats[cat] = { approved: 0, ignored: 0, total: 0 };
      stats[cat].total++;
      if (f.action === 'approved') stats[cat].approved++;
      else stats[cat].ignored++;
    });
  });

  // 计算权重
  const boosts = {};
  Object.entries(stats).forEach(([cat, s]) => {
    if (s.total < MIN_SAMPLES) return;

    const approvalRate = s.approved / s.total;
    // 偏离基准线的程度 * 学习率 * 放大系数
    const boost = (approvalRate - BASELINE_RATE) * LEARNING_RATE * 10;
    boosts[cat] = Math.max(WEIGHT_BOUNDS[0], Math.min(WEIGHT_BOUNDS[1], boost));
  });

  return boosts;
}

/**
 * 计算来源偏好权重
 */
function calculateSourceBoosts(feedbackHistory) {
  const stats = {};

  feedbackHistory.forEach(f => {
    (f.sourceArticles || []).forEach(a => {
      const src = a.source || 'unknown';
      if (!stats[src]) stats[src] = { approved: 0, ignored: 0, total: 0 };
      stats[src].total++;
      if (f.action === 'approved') stats[src].approved++;
      else stats[src].ignored++;
    });
  });

  const boosts = {};
  Object.entries(stats).forEach(([src, s]) => {
    if (s.total < MIN_SAMPLES) return;

    const approvalRate = s.approved / s.total;
    const boost = (approvalRate - BASELINE_RATE) * LEARNING_RATE * 10;
    boosts[src] = Math.max(WEIGHT_BOUNDS[0], Math.min(WEIGHT_BOUNDS[1], boost));
  });

  return boosts;
}

/**
 * 应用时间衰减
 */
function applyDecay(weights, daysSinceUpdate) {
  if (!weights || daysSinceUpdate <= 0) return weights;

  const decayFactor = Math.pow(DECAY_RATE, daysSinceUpdate);
  const decayed = {};

  Object.entries(weights).forEach(([key, value]) => {
    decayed[key] = value * decayFactor;
    // 清理接近零的权重
    if (Math.abs(decayed[key]) < 0.01) delete decayed[key];
  });

  return decayed;
}

/**
 * 主学习函数
 */
function learn(staticData) {
  const history = staticData.feedbackHistory || [];
  const oldWeights = staticData.learnedWeights || {};

  if (history.length < MIN_SAMPLES) {
    return { updated: false, reason: 'insufficient_samples' };
  }

  // 计算新权重
  const categoryBoosts = calculateCategoryBoosts(history);
  const sourceBoosts = calculateSourceBoosts(history);

  // 应用衰减到旧权重
  const daysSinceUpdate = oldWeights.updated_at
    ? (Date.now() - oldWeights.updated_at) / (24 * 60 * 60 * 1000)
    : 0;

  const decayedCategory = applyDecay(oldWeights.categoryBoosts || {}, daysSinceUpdate);
  const decayedSource = applyDecay(oldWeights.sourceBoosts || {}, daysSinceUpdate);

  // 合并新旧权重（新权重优先）
  const mergedCategory = { ...decayedCategory, ...categoryBoosts };
  const mergedSource = { ...decayedSource, ...sourceBoosts };

  // 保存
  staticData.learnedWeights = {
    version: (oldWeights.version || 0) + 1,
    updated_at: Date.now(),
    categoryBoosts: mergedCategory,
    sourceBoosts: mergedSource,
    stats: {
      samples: history.length,
      categories: Object.keys(mergedCategory).length,
      sources: Object.keys(mergedSource).length
    }
  };

  return {
    updated: true,
    weights: staticData.learnedWeights
  };
}

/**
 * 获取评分调整值
 */
function getScoreAdjustment(weights, category, source) {
  let adjustment = 0;

  if (weights.categoryBoosts && weights.categoryBoosts[category]) {
    adjustment += weights.categoryBoosts[category];
  }

  if (weights.sourceBoosts && weights.sourceBoosts[source]) {
    adjustment += weights.sourceBoosts[source];
  }

  return adjustment;
}

module.exports = {
  calculateCategoryBoosts,
  calculateSourceBoosts,
  applyDecay,
  learn,
  getScoreAdjustment,
  LEARNING_RATE,
  DECAY_RATE,
  MIN_SAMPLES,
  WEIGHT_BOUNDS,
  BASELINE_RATE
};
