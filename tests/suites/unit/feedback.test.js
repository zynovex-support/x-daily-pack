/**
 * Feedback Storage Unit Tests
 */

const {
  initStorage,
  recordFeedback,
  cleanExpiredFeedback,
  getFeedbackStats,
  saveLearnedWeights,
  getLearnedWeights
} = require('../../../scripts/feedback-storage');

console.log('='.repeat(50));
console.log('Feedback Storage Unit Tests');
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

// Test 1: initStorage
test('initStorage: creates empty structures', () => {
  const data = {};
  initStorage(data);
  assert(Array.isArray(data.feedbackHistory), 'feedbackHistory should be array');
  assert(data.learnedWeights.version === 1, 'version should be 1');
});

// Test 2: recordFeedback
test('recordFeedback: creates feedback record', () => {
  const data = { feedbackHistory: [], learnedWeights: {} };
  const feedback = {
    userId: 'U123',
    action: 'approved',
    tweetOption: 1,
    sourceArticles: [{ url: 'http://test.com', title: 'Test', source: 'Test', category: 'tool' }]
  };
  const record = recordFeedback(data, feedback);
  assert(record.feedbackId.startsWith('fb_'), 'feedbackId should start with fb_');
  assert(record.action === 'approved', 'action should be approved');
  assert(data.feedbackHistory.length === 1, 'should have 1 record');
});

// Test 3: getFeedbackStats
test('getFeedbackStats: calculates stats correctly', () => {
  const data = {
    feedbackHistory: [
      { action: 'approved', timestamp: Date.now(), sourceArticles: [{ category: 'tool', source: 'A' }] },
      { action: 'approved', timestamp: Date.now(), sourceArticles: [{ category: 'tool', source: 'A' }] },
      { action: 'ignored', timestamp: Date.now(), sourceArticles: [{ category: 'insight', source: 'B' }] }
    ]
  };
  const stats = getFeedbackStats(data);
  assert(stats.total === 3, 'total should be 3');
  assert(stats.approved === 2, 'approved should be 2');
  assert(stats.ignored === 1, 'ignored should be 1');
  assert(stats.byCategory.tool.approved === 2, 'tool approved should be 2');
});

// Test 4: saveLearnedWeights
test('saveLearnedWeights: saves and increments version', () => {
  const data = { learnedWeights: { version: 1 } };
  const weights = { categoryBoosts: { tool: 0.5 }, sourceBoosts: {} };
  saveLearnedWeights(data, weights);
  assert(data.learnedWeights.version === 2, 'version should be 2');
  assert(data.learnedWeights.categoryBoosts.tool === 0.5, 'tool boost should be 0.5');
});

// Test 5: getLearnedWeights
test('getLearnedWeights: returns default if empty', () => {
  const data = {};
  const weights = getLearnedWeights(data);
  assert(weights.version === 0, 'version should be 0');
  assert(Object.keys(weights.categoryBoosts).length === 0, 'categoryBoosts should be empty');
});

console.log('');
console.log('='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

process.exit(failed > 0 ? 1 : 0);
