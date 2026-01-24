/**
 * Custom Promptfoo Assertions for Scoring
 */

// Validate score is within expected range
function validateScoreRange(output, context) {
  try {
    const data = JSON.parse(output);
    const item = data.items?.[0];
    if (!item) return { pass: false, reason: 'No items in response' };

    const { timeliness, impact, actionability, relevance, total } = item;

    // Check individual dimension ranges
    if (timeliness < 0 || timeliness > 6) {
      return { pass: false, reason: `timeliness ${timeliness} out of range [0-6]` };
    }
    if (impact < 0 || impact > 9) {
      return { pass: false, reason: `impact ${impact} out of range [0-9]` };
    }
    if (actionability < 0 || actionability > 7) {
      return { pass: false, reason: `actionability ${actionability} out of range [0-7]` };
    }
    if (relevance < 0 || relevance > 8) {
      return { pass: false, reason: `relevance ${relevance} out of range [0-8]` };
    }

    // Check total matches sum
    const expectedTotal = timeliness + impact + actionability + relevance;
    if (Math.abs(total - expectedTotal) > 1) {
      return { pass: false, reason: `total ${total} != sum ${expectedTotal}` };
    }

    return { pass: true };
  } catch (e) {
    return { pass: false, reason: `Parse error: ${e.message}` };
  }
}

// Validate category is valid
function validateCategory(output, context) {
  const validCategories = [
    'announcement', 'insight', 'tool',
    'case', 'research', 'risk'
  ];

  try {
    const data = JSON.parse(output);
    const category = data.items?.[0]?.category;

    if (!category) {
      return { pass: false, reason: 'Missing category' };
    }
    if (!validCategories.includes(category)) {
      return { pass: false, reason: `Invalid category: ${category}` };
    }

    return { pass: true };
  } catch (e) {
    return { pass: false, reason: `Parse error: ${e.message}` };
  }
}

module.exports = {
  validateScoreRange,
  validateCategory,
};
