/**
 * Test Fixtures - Embeddings
 */

const EMBEDDING_DIM = 1536;

function hashToEmbedding(text: string): number[] {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash = hash & hash;
  }

  const embedding: number[] = [];
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    hash = (hash * 1103515245 + 12345) & 0x7fffffff;
    embedding.push((hash / 0x7fffffff) * 2 - 1);
  }

  const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  return embedding.map(v => v / norm);
}

export const mockEmbeddings = {
  getEmbedding: hashToEmbedding,

  identical: {
    a: hashToEmbedding('test-identical'),
    b: hashToEmbedding('test-identical'),
  },

  similar: {
    a: hashToEmbedding('OpenAI releases GPT-5'),
    b: hashToEmbedding('OpenAI releases GPT-5').map((v, i) =>
      v + (i % 10 === 0 ? 0.01 : 0)
    ),
  },

  different: {
    a: hashToEmbedding('OpenAI releases GPT-5'),
    b: hashToEmbedding('Tesla announces new electric truck'),
  },
};
