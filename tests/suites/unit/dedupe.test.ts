/**
 * 去重逻辑单元测试
 * Note: API调用测试将在Phase 2添加Mock后启用
 */
import { describe, it, expect } from 'vitest';

// Cosine similarity function (pure logic)
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Test helpers
const randomEmbedding = (dim = 100): number[] => {
  const vec: number[] = [];
  for (let i = 0; i < dim; i++) {
    vec.push(Math.random() * 2 - 1);
  }
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return vec.map(v => v / norm);
};

const similarEmbedding = (base: number[], noise = 0.1): number[] => {
  const vec = base.map(v => v + (Math.random() * 2 - 1) * noise);
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return vec.map(v => v / norm);
};

describe('Dedupe Logic', () => {
  describe('Cosine Similarity', () => {
    it('identical vectors = 1.0', () => {
      const vec = randomEmbedding();
      const sim = cosineSimilarity(vec, vec);
      expect(sim).toBeCloseTo(1.0, 4);
    });

    it('similar vectors > 0.9', () => {
      const base = randomEmbedding();
      const similar = similarEmbedding(base, 0.05);
      const sim = cosineSimilarity(base, similar);
      expect(sim).toBeGreaterThan(0.9);
    });

    it('different vectors < 0.7', () => {
      const a = randomEmbedding();
      const b = randomEmbedding();
      const sim = cosineSimilarity(a, b);
      // Random vectors typically have low similarity
      expect(Math.abs(sim)).toBeLessThan(0.5);
    });
  });
});
