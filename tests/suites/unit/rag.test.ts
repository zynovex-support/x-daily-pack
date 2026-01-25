/**
 * RAG Enhanced Ranking 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';

// 内联测试函数
function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

class SimpleVectorStore {
  vectors: number[][] = [];
  documents: any[] = [];

  async addDocuments(docs: any[], embeddings: number[][]) {
    for (let i = 0; i < docs.length; i++) {
      this.documents.push(docs[i]);
      this.vectors.push(embeddings[i]);
    }
  }

  async similaritySearch(queryEmbedding: number[], k = 3) {
    return this.vectors
      .map((vec, idx) => ({
        score: cosineSimilarity(queryEmbedding, vec),
        doc: this.documents[idx]
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .filter(s => s.score > 0.5);
  }

  get size() { return this.documents.length; }
}

describe('RAG Enhanced Ranking', () => {
  beforeEach(() => {
    console.log('Test suite starting...');
  });

  it('should calculate cosine similarity correctly', () => {
    const a = [1, 0, 0];
    const b = [1, 0, 0];
    expect(cosineSimilarity(a, b)).toBe(1);

    const c = [1, 0, 0];
    const d = [0, 1, 0];
    expect(cosineSimilarity(c, d)).toBe(0);
  });

  it('should add documents to vector store', async () => {
    const store = new SimpleVectorStore();
    await store.addDocuments(
      [{ title: 'Test' }],
      [[0.1, 0.2, 0.3]]
    );
    expect(store.size).toBe(1);
  });

  it('should find similar documents', async () => {
    const store = new SimpleVectorStore();
    await store.addDocuments(
      [{ title: 'AI News' }, { title: 'Sports' }],
      [[0.9, 0.1, 0.0], [0.1, 0.9, 0.0]]
    );

    const results = await store.similaritySearch([0.85, 0.15, 0.0], 2);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].doc.title).toBe('AI News');
  });

  console.log('Test suite completed.');
});
