/**
 * Feedback Learning Unit Tests
 */
import { describe, it, expect } from 'vitest';
import {
  calculateCategoryBoosts,
  applyDecay,
  learn,
  getScoreAdjustment,
  MIN_SAMPLES
} from '../../../scripts/feedback-learning.js';

// Helper to generate test feedback data
interface FeedbackRecord {
  action: string;
  timestamp: number;
  sourceArticles: Array<{ category: string; source: string }>;
}

const generateFeedback = (
  category: string, source: string, action: string, count: number
): FeedbackRecord[] => {
  const records: FeedbackRecord[] = [];
  for (let i = 0; i < count; i++) {
    records.push({
      action,
      timestamp: Date.now(),
      sourceArticles: [{ category, source }]
    });
  }
  return records;
};

describe('Feedback Learning', () => {
  describe('calculateCategoryBoosts', () => {
    it('returns empty with < MIN_SAMPLES', () => {
      const history = generateFeedback('tool', 'A', 'approved', 2);
      const boosts = calculateCategoryBoosts(history);
      expect(Object.keys(boosts).length).toBe(0);
    });

    it('calculates boost with enough samples', () => {
      const history = [
        ...generateFeedback('tool', 'A', 'approved', 8),
        ...generateFeedback('tool', 'A', 'ignored', 2)
      ];
      const boosts = calculateCategoryBoosts(history);
      expect(boosts.tool).toBeGreaterThan(0);
    });

    it('negative boost for low approval', () => {
      const history = [
        ...generateFeedback('insight', 'A', 'approved', 1),
        ...generateFeedback('insight', 'A', 'ignored', 9)
      ];
      const boosts = calculateCategoryBoosts(history);
      expect(boosts.insight).toBeLessThan(0);
    });
  });

  describe('applyDecay', () => {
    it('reduces weights over time', () => {
      const weights = { tool: 1.0, insight: -1.0 };
      const decayed = applyDecay(weights, 7);
      expect(Math.abs(decayed.tool)).toBeLessThan(1.0);
      expect(Math.abs(decayed.insight)).toBeLessThan(1.0);
    });

    it('removes near-zero weights', () => {
      const weights = { tool: 0.001 };
      const decayed = applyDecay(weights, 30);
      expect(decayed.tool).toBeFalsy();
    });
  });

  describe('getScoreAdjustment', () => {
    it('combines category and source boosts', () => {
      const weights = {
        categoryBoosts: { tool: 1.0 },
        sourceBoosts: { 'OpenAI': 0.5 }
      };
      const adj = getScoreAdjustment(weights, 'tool', 'OpenAI');
      expect(adj).toBe(1.5);
    });
  });

  describe('learn', () => {
    it('returns not updated with insufficient samples', () => {
      const data = { feedbackHistory: [] };
      const result = learn(data);
      expect(result.updated).toBe(false);
      expect(result.reason).toBe('insufficient_samples');
    });

    it('updates weights with enough samples', () => {
      const data = {
        feedbackHistory: [
          ...generateFeedback('tool', 'A', 'approved', 8),
          ...generateFeedback('tool', 'A', 'ignored', 2)
        ],
        learnedWeights: { version: 0 }
      };
      const result = learn(data);
      expect(result.updated).toBe(true);
      expect(data.learnedWeights.version).toBe(1);
    });
  });
});
