/**
 * 评分逻辑单元测试
 * Note: API调用测试已移至集成测试，此处仅测试纯逻辑
 */
import { describe, it, expect } from 'vitest';
import { testConfig } from '../../setup/global-setup';

// Tier boost configuration (mirrors llm-rank-node.js)
const TIER_BOOST: Record<string, { impact: number; actionability: number }> = {
  'A': { impact: 2, actionability: 1 },
  'B': { impact: 0, actionability: 0 },
  'C': { impact: -1, actionability: -1 },
  'D': { impact: -2, actionability: -1 }
};

interface Score {
  timeliness: number;
  impact: number;
  actionability: number;
  relevance: number;
}

function applyTierBoost(score: Score, tier: string) {
  const boost = TIER_BOOST[tier] || TIER_BOOST['B'];
  const adjustedImpact = Math.max(0, Math.min(9, score.impact + boost.impact));
  const adjustedActionability = Math.max(0, Math.min(7, score.actionability + boost.actionability));
  return {
    ...score,
    impact: adjustedImpact,
    actionability: adjustedActionability,
    total: score.timeliness + adjustedImpact + adjustedActionability + score.relevance,
    tierBoost: boost.impact + boost.actionability
  };
}

describe('Scoring Logic', () => {
  describe('Configuration', () => {
    it('has scoring dimensions defined', () => {
      expect(testConfig.scoring.dimensions).toContain('timeliness');
      expect(testConfig.scoring.dimensions).toContain('impact');
      expect(testConfig.scoring.dimensions).toContain('actionability');
      expect(testConfig.scoring.dimensions).toContain('relevance');
    });

    it('has valid categories', () => {
      expect(testConfig.scoring.categories).toContain('announcement');
      expect(testConfig.scoring.categories).toContain('tool');
      expect(testConfig.scoring.categories).toContain('insight');
    });
  });

  describe('Tier Boost Calculations', () => {
    const baseScore: Score = { timeliness: 4, impact: 5, actionability: 4, relevance: 5 };

    it('Tier A加权正确 (+3分)', () => {
      const boosted = applyTierBoost(baseScore, 'A');
      expect(boosted.impact).toBe(7);
      expect(boosted.actionability).toBe(5);
      expect(boosted.tierBoost).toBe(3);
    });

    it('Tier C加权正确 (-2分)', () => {
      const boosted = applyTierBoost(baseScore, 'C');
      expect(boosted.impact).toBe(4);
      expect(boosted.actionability).toBe(3);
      expect(boosted.tierBoost).toBe(-2);
    });

    it('Tier A vs Tier C差距5分', () => {
      const tierA = applyTierBoost(baseScore, 'A');
      const tierC = applyTierBoost(baseScore, 'C');
      expect(tierA.total - tierC.total).toBe(5);
    });

    it('Impact caps at 9', () => {
      const highImpact: Score = { timeliness: 4, impact: 8, actionability: 6, relevance: 5 };
      const boosted = applyTierBoost(highImpact, 'A');
      expect(boosted.impact).toBe(9);
    });

    it('Impact floors at 0', () => {
      const lowImpact: Score = { timeliness: 4, impact: 1, actionability: 1, relevance: 5 };
      const boosted = applyTierBoost(lowImpact, 'D');
      expect(boosted.impact).toBe(0);
      expect(boosted.actionability).toBe(0);
    });
  });
});
