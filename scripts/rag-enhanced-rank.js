/**
 * RAG Enhanced Ranking - 基于历史数据的智能评分
 * Phase 3: AI 增强
 *
 * 功能：
 * - 向量化历史优质内容
 * - 相似内容检索
 * - 上下文增强评分
 */

const { OpenAIEmbeddings } = require('@langchain/openai');

// 内存向量存储 (生产环境可替换为 Pinecone/Qdrant)
class SimpleVectorStore {
  constructor() {
    this.vectors = [];
    this.documents = [];
  }

  async addDocuments(docs, embeddings) {
    for (let i = 0; i < docs.length; i++) {
      this.documents.push(docs[i]);
      this.vectors.push(embeddings[i]);
    }
  }

  async similaritySearch(queryEmbedding, k = 3) {
    const scores = this.vectors.map((vec, idx) => ({
      score: cosineSimilarity(queryEmbedding, vec),
      doc: this.documents[idx]
    }));

    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .filter(s => s.score > 0.5);
  }

  get size() {
    return this.documents.length;
  }
}

// 余弦相似度
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

// 全局存储实例
let vectorStore = null;
let embeddingsModel = null;

/**
 * 初始化 RAG 系统
 */
async function initRAG(options = {}) {
  const { apiKey = process.env.OPENAI_API_KEY } = options;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY required');
  }

  embeddingsModel = new OpenAIEmbeddings({
    openAIApiKey: apiKey,
    modelName: 'text-embedding-3-small'
  });

  vectorStore = new SimpleVectorStore();
  console.log('[RAG] Initialized');

  return { vectorStore, embeddingsModel };
}

/**
 * 添加历史优质内容到向量库
 */
async function addHistoricalContent(items) {
  if (!vectorStore || !embeddingsModel) {
    await initRAG();
  }

  const texts = items.map(item =>
    `${item.title || ''} ${(item.content || item.description || '').slice(0, 300)}`
  );

  const embeddings = await embeddingsModel.embedDocuments(texts);
  await vectorStore.addDocuments(items, embeddings);

  console.log(`[RAG] Added ${items.length} items, total: ${vectorStore.size}`);
  return vectorStore.size;
}

/**
 * 基于相似内容增强评分
 */
async function enhanceWithRAG(items, options = {}) {
  const { boostFactor = 1.2, debug = false } = options;

  if (!vectorStore || vectorStore.size === 0) {
    if (debug) console.log('[RAG] No historical data, skipping enhancement');
    return items;
  }

  const results = [];

  for (const item of items) {
    const text = `${item.title || ''} ${(item.content || '').slice(0, 300)}`;
    const [embedding] = await embeddingsModel.embedDocuments([text]);
    const similar = await vectorStore.similaritySearch(embedding, 3);

    let ragBoost = 1.0;
    if (similar.length > 0) {
      const avgScore = similar.reduce((sum, s) => sum + s.score, 0) / similar.length;
      ragBoost = 1 + (avgScore - 0.5) * (boostFactor - 1);
    }

    const enhancedScore = Math.round((item.score || 0) * ragBoost);

    if (debug && similar.length > 0) {
      console.log(`[RAG] ${item.title?.slice(0, 30)}... boost: ${ragBoost.toFixed(2)}`);
    }

    results.push({
      ...item,
      originalScore: item.score,
      score: enhancedScore,
      ragEnhanced: similar.length > 0,
      ragSimilarCount: similar.length
    });
  }

  return results;
}

module.exports = {
  initRAG,
  addHistoricalContent,
  enhanceWithRAG,
  SimpleVectorStore,
  cosineSimilarity
};
