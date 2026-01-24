/**
 * Feedback Storage Unit Tests
 */
import { describe, it, expect } from 'vitest';
import {
  initStorage,
  recordFeedback,
  getFeedbackStats,
  saveLearnedWeights,
  getLearnedWeights
} from '../../../scripts/feedback-storage.js';

describe('Feedback Storage', () => {
  describe('initStorage', () => {
    it('creates empty structures', () => {
      const data: Record<string, unknown> = {};
      initStorage(data);
      expect(Array.isArray(data.feedbackHistory)).toBe(true);
      expect((data.learnedWeights as { version: number }).version).toBe(1);
    });
  });

  describe('recordFeedback', () => {
    it('creates feedback record', () => {
      const data = { feedbackHistory: [] as unknown[], learnedWeights: {} };
      const feedback = {
        userId: 'U123',
        action: 'approved',
        tweetOption: 1,
        sourceArticles: [{ url: 'http://test.com', title: 'Test', source: 'Test', category: 'tool' }]
      };
      const record = recordFeedback(data, feedback);
      expect(record.feedbackId.startsWith('fb_')).toBe(true);
      expect(record.action).toBe('approved');
      expect(data.feedbackHistory.length).toBe(1);
    });
  });

  describe('getFeedbackStats', () => {
    it('calculates stats correctly', () => {
      const data = {
        feedbackHistory: [
          { action: 'approved', timestamp: Date.now(), sourceArticles: [{ category: 'tool', source: 'A' }] },
          { action: 'approved', timestamp: Date.now(), sourceArticles: [{ category: 'tool', source: 'A' }] },
          { action: 'ignored', timestamp: Date.now(), sourceArticles: [{ category: 'insight', source: 'B' }] }
        ]
      };
      const stats = getFeedbackStats(data);
      expect(stats.total).toBe(3);
      expect(stats.approved).toBe(2);
      expect(stats.ignored).toBe(1);
      expect(stats.byCategory.tool.approved).toBe(2);
    });
  });

  describe('saveLearnedWeights', () => {
    it('saves and increments version', () => {
      const data = { learnedWeights: { version: 1 } };
      const weights = { categoryBoosts: { tool: 0.5 }, sourceBoosts: {} };
      saveLearnedWeights(data, weights);
      expect(data.learnedWeights.version).toBe(2);
      expect((data.learnedWeights as { categoryBoosts: { tool: number } }).categoryBoosts.tool).toBe(0.5);
    });
  });

  describe('getLearnedWeights', () => {
    it('returns default if empty', () => {
      const data = {};
      const weights = getLearnedWeights(data);
      expect(weights.version).toBe(0);
      expect(Object.keys(weights.categoryBoosts).length).toBe(0);
    });
  });
});
