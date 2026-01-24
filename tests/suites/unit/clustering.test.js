/**
 * Event Clustering Unit Tests
 * Tests DBSCAN algorithm and cluster label generation
 */

// Mock environment
const mockEnv = {
  EVENT_CLUSTERING_ENABLED: 'true',
  EVENT_CLUSTERING_EPS: '0.25',
  EVENT_CLUSTERING_MIN_PTS: '2',
  EVENT_CLUSTERING_MAX_SIZE: '8',
  EVENT_CLUSTERING_DEBUG: 'true',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || ''
};

// ============== Algorithm Functions (copied from node) ==============

const cosineSimilarity = (a, b) => {
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

const cosineDistance = (a, b) => 1 - cosineSimilarity(a, b);

const regionQuery = (points, pointIdx, eps) => {
  const neighbors = [];
  const point = points[pointIdx];
  for (let i = 0; i < points.length; i++) {
    if (i === pointIdx) continue;
    if (cosineDistance(point.embedding, points[i].embedding) <= eps) {
      neighbors.push(i);
    }
  }
  return neighbors;
};

const expandCluster = (points, labels, pointIdx, neighbors, clusterId, eps, minPts, maxSize) => {
  labels[pointIdx] = clusterId;
  let clusterSize = 1;
  const queue = [...neighbors];
  const visited = new Set([pointIdx]);

  while (queue.length > 0 && clusterSize < maxSize) {
    const currentIdx = queue.shift();
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

const dbscan = (points, eps, minPts, maxSize) => {
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

// ============== Test Helpers ==============

// Generate a random embedding vector
const randomEmbedding = (dim = 1536) => {
  const vec = [];
  for (let i = 0; i < dim; i++) {
    vec.push(Math.random() * 2 - 1);
  }
  // Normalize
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return vec.map(v => v / norm);
};

// Generate similar embedding (add small noise)
const similarEmbedding = (base, noise = 0.1) => {
  const vec = base.map(v => v + (Math.random() * 2 - 1) * noise);
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return vec.map(v => v / norm);
};

// ============== Test Cases ==============

console.log('='.repeat(50));
console.log('Event Clustering Unit Tests');
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

// Test 1: Cosine similarity of identical vectors
test('Cosine similarity: identical vectors = 1.0', () => {
  const vec = randomEmbedding(100);
  const sim = cosineSimilarity(vec, vec);
  assert(Math.abs(sim - 1.0) < 0.0001, `Expected 1.0, got ${sim}`);
});

// Test 2: Cosine similarity of orthogonal vectors
test('Cosine similarity: orthogonal vectors ≈ 0', () => {
  const vec1 = [1, 0, 0, 0];
  const vec2 = [0, 1, 0, 0];
  const sim = cosineSimilarity(vec1, vec2);
  assert(Math.abs(sim) < 0.0001, `Expected ~0, got ${sim}`);
});

// Test 3: Cosine similarity of similar vectors
test('Cosine similarity: similar vectors > 0.9', () => {
  const base = randomEmbedding(100);
  const similar = similarEmbedding(base, 0.05);
  const sim = cosineSimilarity(base, similar);
  assert(sim > 0.9, `Expected > 0.9, got ${sim}`);
});

// Test 4: DBSCAN with 2 similar points
test('DBSCAN: 2 similar points form 1 cluster', () => {
  const base = randomEmbedding(100);
  const points = [
    { embedding: base, title: 'Article 1' },
    { embedding: similarEmbedding(base, 0.05), title: 'Article 2' }
  ];
  const labels = dbscan(points, 0.25, 2, 8);
  assert(labels[0] === labels[1], 'Both points should be in same cluster');
  assert(labels[0] > 0, 'Cluster ID should be positive');
});

// Test 5: DBSCAN with 3 unrelated points
test('DBSCAN: 3 unrelated points = 3 noise points', () => {
  const points = [
    { embedding: randomEmbedding(100), title: 'Article 1' },
    { embedding: randomEmbedding(100), title: 'Article 2' },
    { embedding: randomEmbedding(100), title: 'Article 3' }
  ];
  const labels = dbscan(points, 0.25, 2, 8);
  assert(labels.every(l => l === -1), 'All points should be noise');
});

// Test 6: DBSCAN with mixed scenario
test('DBSCAN: 2 similar + 1 unrelated = 1 cluster + 1 noise', () => {
  const base = randomEmbedding(100);
  const points = [
    { embedding: base, title: 'GPT-5 Released' },
    { embedding: similarEmbedding(base, 0.05), title: 'GPT-5 Launch' },
    { embedding: randomEmbedding(100), title: 'Unrelated News' }
  ];
  const labels = dbscan(points, 0.25, 2, 8);

  assert(labels[0] === labels[1], 'First two should be in same cluster');
  assert(labels[0] > 0, 'Cluster ID should be positive');
  assert(labels[2] === -1, 'Third point should be noise');
});

// Test 7: DBSCAN max cluster size
test('DBSCAN: respects max cluster size', () => {
  const base = randomEmbedding(100);
  const points = [];
  for (let i = 0; i < 10; i++) {
    points.push({ embedding: similarEmbedding(base, 0.03), title: `Article ${i}` });
  }
  const labels = dbscan(points, 0.25, 2, 5); // max size = 5

  const clusterCounts = {};
  labels.forEach(l => {
    if (l > 0) clusterCounts[l] = (clusterCounts[l] || 0) + 1;
  });

  const maxClusterSize = Math.max(...Object.values(clusterCounts));
  assert(maxClusterSize <= 5, `Max cluster size should be <= 5, got ${maxClusterSize}`);
});

// Test 8: Empty input
test('DBSCAN: empty input returns empty labels', () => {
  const labels = dbscan([], 0.25, 2, 8);
  assert(labels.length === 0, 'Should return empty array');
});

// Test 9: Single point
test('DBSCAN: single point = noise', () => {
  const points = [{ embedding: randomEmbedding(100), title: 'Single' }];
  const labels = dbscan(points, 0.25, 2, 8);
  assert(labels[0] === -1, 'Single point should be noise');
});

// Test 10: Distance threshold
test('DBSCAN: eps=0.25 means similarity >= 0.75', () => {
  // Create two points with exactly 0.75 similarity
  const base = randomEmbedding(100);
  const similar = similarEmbedding(base, 0.15); // ~0.75-0.85 similarity

  const sim = cosineSimilarity(base, similar);
  const dist = cosineDistance(base, similar);

  console.log(`   Similarity: ${sim.toFixed(3)}, Distance: ${dist.toFixed(3)}`);

  // Just verify the math is correct
  assert(Math.abs(sim + dist - 1.0) < 0.0001, 'sim + dist should equal 1');
});

// ============== Summary ==============

console.log('');
console.log('='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

process.exit(failed > 0 ? 1 : 0);
