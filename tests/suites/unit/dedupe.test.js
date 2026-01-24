/**
 * 去重逻辑单元测试
 */

const { assert } = require('../../lib/assertions');
const { request } = require('../../lib/http-client');
const config = require('../../config/test.config');

async function getEmbeddings(texts) {
  const res = await request('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apis.openai}`,
      'Content-Type': 'application/json'
    },
    body: { model: config.dedupe.embeddingModel, input: texts }
  });
  return res.data.data.map(d => d.embedding);
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

module.exports = {
  name: 'Dedupe Logic',

  tests: [
    {
      name: 'Embedding API连接',
      run: async () => {
        const embeddings = await getEmbeddings(['test']);
        assert.isArray(embeddings);
        assert.equal(embeddings.length, 1);
      }
    },
    {
      name: '相同内容相似度>0.95',
      run: async () => {
        const texts = ['OpenAI releases GPT-5', 'OpenAI releases GPT-5'];
        const [a, b] = await getEmbeddings(texts);
        const sim = cosineSimilarity(a, b);
        assert.greaterThan(sim, 0.95);
      }
    },
    {
      name: '同事件不同报道相似度>0.80',
      run: async () => {
        const texts = [
          'OpenAI announces GPT-5 with revolutionary new capabilities in reasoning and coding',
          'OpenAI releases GPT-5 featuring breakthrough capabilities in reasoning and code generation'
        ];
        const [a, b] = await getEmbeddings(texts);
        const sim = cosineSimilarity(a, b);
        assert.greaterThan(sim, 0.80);
      }
    },
    {
      name: '不同内容相似度<0.7',
      run: async () => {
        const texts = [
          'OpenAI releases GPT-5',
          'Tesla announces new electric truck'
        ];
        const [a, b] = await getEmbeddings(texts);
        const sim = cosineSimilarity(a, b);
        assert.ok(sim < 0.7, `Expected < 0.7, got ${sim}`);
      }
    }
  ]
};
