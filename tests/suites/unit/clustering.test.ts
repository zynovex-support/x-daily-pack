/**
 * Event Clustering Unit Tests
 * Tests DBSCAN algorithm and cluster label generation
 */
import { describe, it, expect } from 'vitest';

// Algorithm Functions
const cosineSimilarity = (a: number[], b: number[]): number => {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const cosineDistance = (a: number[], b: number[]): number => 1 - cosineSimilarity(a, b);

interface Point {
  embedding: number[];
  title: string;
}

const regionQuery = (points: Point[], pointIdx: number, eps: number): number[] => {
  const neighbors: number[] = [];
  const point = points[pointIdx];
  for (let i = 0; i < points.length; i++) {
    if (i === pointIdx) continue;
    if (cosineDistance(point.embedding, points[i].embedding) <= eps) {
      neighbors.push(i);
    }
  }
  return neighbors;
};

const expandCluster = (
  points: Point[], labels: number[], pointIdx: number,
  neighbors: number[], clusterId: number, eps: number, minPts: number, maxSize: number
): number => {
  labels[pointIdx] = clusterId;
  let clusterSize = 1;
  const queue = [...neighbors];
  const visited = new Set([pointIdx]);

  while (queue.length > 0 && clusterSize < maxSize) {
    const currentIdx = queue.shift()!;
    if (visited.has(currentIdx)) continue;
    visited.add(currentIdx);

    if (labels[currentIdx] === -1) {
      labels[currentIdx] = clusterId;
      clusterSize++;
    }

    if (labels[currentIdx] === 0) {
      labels[currentIdx] = clusterId;
      clusterSize++;
      const newNeighbors = regionQuery(points, currentIdx, eps);
      if (newNeighbors.length >= minPts - 1) {
        for (const n of newNeighbors) {
          if (!visited.has(n)) queue.push(n);
        }
      }
    }
  }
  return clusterSize;
};

const dbscan = (points: Point[], eps: number, minPts: number, maxSize: number): number[] => {
  const n = points.length;
  const labels = new Array(n).fill(0);
  let clusterId = 0;

  for (let i = 0; i < n; i++) {
    if (labels[i] !== 0) continue;
    const neighbors = regionQuery(points, i, eps);
    if (neighbors.length < minPts - 1) {
      labels[i] = -1;
    } else {
      clusterId++;
      expandCluster(points, labels, i, neighbors, clusterId, eps, minPts, maxSize);
    }
  }
  return labels;
};

// Test Helpers
const randomEmbedding = (dim = 1536): number[] => {
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

// Test Cases
describe('Event Clustering', () => {
  describe('Cosine Similarity', () => {
    it('identical vectors = 1.0', () => {
      const vec = randomEmbedding(100);
      const sim = cosineSimilarity(vec, vec);
      expect(Math.abs(sim - 1.0)).toBeLessThan(0.0001);
    });

    it('orthogonal vectors ≈ 0', () => {
      const vec1 = [1, 0, 0, 0];
      const vec2 = [0, 1, 0, 0];
      const sim = cosineSimilarity(vec1, vec2);
      expect(Math.abs(sim)).toBeLessThan(0.0001);
    });

    it('similar vectors > 0.9', () => {
      const base = randomEmbedding(100);
      const similar = similarEmbedding(base, 0.05);
      const sim = cosineSimilarity(base, similar);
      expect(sim).toBeGreaterThan(0.9);
    });
  });

  describe('DBSCAN Algorithm', () => {
    it('2 similar points form 1 cluster', () => {
      const base = randomEmbedding(100);
      const points: Point[] = [
        { embedding: base, title: 'Article 1' },
        { embedding: similarEmbedding(base, 0.05), title: 'Article 2' }
      ];
      const labels = dbscan(points, 0.25, 2, 8);
      expect(labels[0]).toBe(labels[1]);
      expect(labels[0]).toBeGreaterThan(0);
    });

    it('3 unrelated points = 3 noise points', () => {
      const points: Point[] = [
        { embedding: randomEmbedding(100), title: 'Article 1' },
        { embedding: randomEmbedding(100), title: 'Article 2' },
        { embedding: randomEmbedding(100), title: 'Article 3' }
      ];
      const labels = dbscan(points, 0.25, 2, 8);
      expect(labels.every(l => l === -1)).toBe(true);
    });

    it('2 similar + 1 unrelated = 1 cluster + 1 noise', () => {
      const base = randomEmbedding(100);
      const points: Point[] = [
        { embedding: base, title: 'GPT-5 Released' },
        { embedding: similarEmbedding(base, 0.05), title: 'GPT-5 Launch' },
        { embedding: randomEmbedding(100), title: 'Unrelated News' }
      ];
      const labels = dbscan(points, 0.25, 2, 8);
      expect(labels[0]).toBe(labels[1]);
      expect(labels[0]).toBeGreaterThan(0);
      expect(labels[2]).toBe(-1);
    });

    it('respects max cluster size', () => {
      const base = randomEmbedding(100);
      const points: Point[] = [];
      for (let i = 0; i < 10; i++) {
        points.push({ embedding: similarEmbedding(base, 0.03), title: `Article ${i}` });
      }
      const labels = dbscan(points, 0.25, 2, 5);
      const clusterCounts: Record<number, number> = {};
      labels.forEach(l => {
        if (l > 0) clusterCounts[l] = (clusterCounts[l] || 0) + 1;
      });
      const maxClusterSize = Math.max(...Object.values(clusterCounts));
      expect(maxClusterSize).toBeLessThanOrEqual(5);
    });

    it('empty input returns empty labels', () => {
      const labels = dbscan([], 0.25, 2, 8);
      expect(labels.length).toBe(0);
    });

    it('single point = noise', () => {
      const points: Point[] = [{ embedding: randomEmbedding(100), title: 'Single' }];
      const labels = dbscan(points, 0.25, 2, 8);
      expect(labels[0]).toBe(-1);
    });

    it('eps=0.25 means similarity >= 0.75', () => {
      const base = randomEmbedding(100);
      const similar = similarEmbedding(base, 0.15);
      const sim = cosineSimilarity(base, similar);
      const dist = cosineDistance(base, similar);
      expect(Math.abs(sim + dist - 1.0)).toBeLessThan(0.0001);
    });
  });
});
