/**
 * Feedback Learning Unit Tests
 */

const {
  calculateCategoryBoosts,
  calculateSourceBoosts,
  applyDecay,
  learn,
  getScoreAdjustment,
  MIN_SAMPLES
} = require('../../../scripts/feedback-learning');

console.log('='.repeat(50));
console.log('Feedback Learning Unit Tests');
console.log('='.repeat(50));
console.log('');

let passed = 0;
let failed = 0;

const test = (name, fn) => {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    failed++;
  }
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message || 'Assertion failed');
};

// 生成测试反馈数据
const generateFeedback = (category, source, action, count) => {
  const records = [];
  for (let i = 0; i < count; i++) {
    records.push({
      action,
      timestamp: Date.now(),
      sourceArticles: [{ category, source }]
    });
  }
  return records;
};

// Test 1: calculateCategoryBoosts with insufficient samples
test('calculateCategoryBoosts: returns empty with < MIN_SAMPLES', () => {
  const history = generateFeedback('tool', 'A', 'approved', 2);
  const boosts = calculateCategoryBoosts(history);
  assert(Object.keys(boosts).length === 0, 'should be empty');
});

// Test 2: calculateCategoryBoosts with enough samples
test('calculateCategoryBoosts: calculates boost with enough samples', () => {
  const history = [
    ...generateFeedback('tool', 'A', 'approved', 8),
    ...generateFeedback('tool', 'A', 'ignored', 2)
  ];
  const boosts = calculateCategoryBoosts(history);
  assert(boosts.tool > 0, 'tool boost should be positive (80% approval)');
});

// Test 3: calculateCategoryBoosts with low approval
test('calculateCategoryBoosts: negative boost for low approval', () => {
  const history = [
    ...generateFeedback('insight', 'A', 'approved', 1),
    ...generateFeedback('insight', 'A', 'ignored', 9)
  ];
  const boosts = calculateCategoryBoosts(history);
  assert(boosts.insight < 0, 'insight boost should be negative (10% approval)');
});

// Test 4: applyDecay
test('applyDecay: reduces weights over time', () => {
  const weights = { tool: 1.0, insight: -1.0 };
  const decayed = applyDecay(weights, 7); // 7 days
  assert(Math.abs(decayed.tool) < 1.0, 'tool should decay');
  assert(Math.abs(decayed.insight) < 1.0, 'insight should decay');
});

// Test 5: applyDecay removes near-zero
test('applyDecay: removes near-zero weights', () => {
  const weights = { tool: 0.001 };
  const decayed = applyDecay(weights, 30);
  assert(!decayed.tool, 'near-zero should be removed');
});

// Test 6: getScoreAdjustment
test('getScoreAdjustment: combines category and source boosts', () => {
  const weights = {
    categoryBoosts: { tool: 1.0 },
    sourceBoosts: { 'OpenAI': 0.5 }
  };
  const adj = getScoreAdjustment(weights, 'tool', 'OpenAI');
  assert(adj === 1.5, 'should be 1.5 (1.0 + 0.5)');
});

// Test 7: learn with insufficient data
test('learn: returns not updated with insufficient samples', () => {
  const data = { feedbackHistory: [] };
  const result = learn(data);
  assert(!result.updated, 'should not update');
  assert(result.reason === 'insufficient_samples', 'reason should be insufficient');
});

// Test 8: learn with enough data
test('learn: updates weights with enough samples', () => {
  const data = {
    feedbackHistory: [
      ...generateFeedback('tool', 'A', 'approved', 8),
      ...generateFeedback('tool', 'A', 'ignored', 2)
    ],
    learnedWeights: { version: 0 }
  };
  const result = learn(data);
  assert(result.updated, 'should update');
  assert(data.learnedWeights.version === 1, 'version should be 1');
});

console.log('');
console.log('='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

process.exit(failed > 0 ? 1 : 0);
