// Semantic Dedupe Node
// 使用 OpenAI Embedding 进行语义级去重，识别"不同URL但话题相同"的内容
//
// 工作流程：
// 1. 为每条内容生成 Embedding 向量
// 2. 与历史 Embedding 计算余弦相似度
// 3. 相似度 > 阈值 → 判定为语义重复 → 过滤
// 4. 通过的内容更新到历史存储

const items = $input.all();
const apiKey = $env.OPENAI_API_KEY;

// 配置参数
const SIMILARITY_THRESHOLD = Number.parseFloat($env.SEMANTIC_DEDUPE_THRESHOLD || '0.85');
const EXPIRY_DAYS = Number.parseInt($env.SEMANTIC_DEDUPE_EXPIRY_DAYS || '7', 10);
const MAX_EMBEDDINGS = Number.parseInt($env.SEMANTIC_DEDUPE_MAX_EMBEDDINGS || '500', 10);
const EMBEDDING_MODEL = $env.SEMANTIC_DEDUPE_MODEL || 'text-embedding-3-small';
const BATCH_SIZE = Number.parseInt($env.SEMANTIC_DEDUPE_BATCH_SIZE || '20', 10);
const DEBUG = $env.SEMANTIC_DEDUPE_DEBUG === 'true';
const FILE_STORE_ENABLED = String($env.SEMANTIC_DEDUPE_FILE_STORE || 'true').toLowerCase() !== 'false';
const FILE_STORE_PATH = $env.SEMANTIC_DEDUPE_STORE_PATH || '/home/node/.n8n/x-daily-pack-embeddings.json';

const safeRequire = (name) => {
  try { return require(name); } catch (err) { return null; }
};
const fs = safeRequire('fs');
const path = safeRequire('path');

if (!apiKey) {
  console.log('Warning: Missing OPENAI_API_KEY, skipping semantic dedupe');
  return items;
}

if (items.length === 0) {
  return [];
}

// ============== 工具函数 ==============

// 余弦相似度计算
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

// 生成内容的文本表示（用于Embedding）
const getContentText = (item) => {
  const data = item.json || item;
  const title = String(data.title || data.text || '').trim();
  const snippet = String(data.snippet || data.description || data.summary || '').trim();
  // 组合 title + snippet，限制长度（Embedding模型有token限制）
  const combined = `${title}\n${snippet}`.slice(0, 500);
  return combined;
};

// 生成内容的唯一标识（用于存储）
const getContentId = (item) => {
  const data = item.json || item;
  const url = data.url || '';
  // 使用URL的hash作为ID
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `emb_${Math.abs(hash).toString(36)}`;
};

// 批量调用 OpenAI Embedding API
const getEmbeddings = async (texts) => {
  if (texts.length === 0) return [];

  try {
    const response = await this.helpers.httpRequest({
      method: 'POST',
      url: 'https://api.openai.com/v1/embeddings',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: {
        model: EMBEDDING_MODEL,
        input: texts
      }
    });

    if (response?.data && Array.isArray(response.data)) {
      // 按 index 排序确保顺序正确
      const sorted = response.data.sort((a, b) => a.index - b.index);
      return sorted.map(d => d.embedding);
    }
    return [];
  } catch (error) {
    console.log('Embedding API error:', error.message || error);
    return [];
  }
};

// 分批处理
const chunk = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

// ============== 存储管理 ==============

const normalizeStore = (store) => {
  if (!store || typeof store !== 'object') return { embeddings: [] };
  if (!Array.isArray(store.embeddings)) store.embeddings = [];
  return store;
};

const loadFileStore = () => {
  if (!FILE_STORE_ENABLED || !fs) return null;
  try {
    if (!fs.existsSync(FILE_STORE_PATH)) return { embeddings: [] };
    const raw = fs.readFileSync(FILE_STORE_PATH, 'utf8');
    if (!raw) return { embeddings: [] };
    return normalizeStore(JSON.parse(raw));
  } catch (err) {
    console.log(`[Semantic Dedupe] File store load failed: ${err.message}`);
    return { embeddings: [] };
  }
};

const saveFileStore = (store) => {
  if (!FILE_STORE_ENABLED || !fs) return false;
  try {
    const dir = path ? path.dirname(FILE_STORE_PATH) : FILE_STORE_PATH.split('/').slice(0, -1).join('/');
    if (dir) fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${FILE_STORE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(store));
    fs.renameSync(tmpPath, FILE_STORE_PATH);
    return true;
  } catch (err) {
    console.log(`[Semantic Dedupe] File store save failed: ${err.message}`);
    return false;
  }
};

const mergeEmbeddings = (base, incoming) => {
  const map = new Map();
  (base || []).forEach((entry) => {
    if (!entry || !entry.id) return;
    map.set(entry.id, entry);
  });
  (incoming || []).forEach((entry) => {
    if (!entry || !entry.id || !Array.isArray(entry.embedding)) return;
    const existing = map.get(entry.id);
    if (!existing || (entry.timestamp || 0) > (existing.timestamp || 0)) {
      map.set(entry.id, entry);
    }
  });
  return Array.from(map.values());
};

let storage = { embeddings: [] };
let storageMode = 'volatile';
let staticData = null;

try {
  staticData = this.getWorkflowStaticData
    ? this.getWorkflowStaticData('global')
    : this.helpers?.getWorkflowStaticData?.call(this, 'global');
  if (staticData) {
    if (!staticData.semanticEmbeddings) staticData.semanticEmbeddings = [];
    storage = normalizeStore({ embeddings: staticData.semanticEmbeddings });
    storage._staticData = staticData;
    storageMode = 'staticData';
  }
} catch (err) {
  staticData = null;
}

const fileStore = loadFileStore();
if (fileStore) {
  storage.embeddings = mergeEmbeddings(storage.embeddings, fileStore.embeddings);
  storageMode = staticData ? 'staticData+file' : 'file';
}

const now = Date.now();
const expiryMs = EXPIRY_DAYS * 24 * 60 * 60 * 1000;

// 清理过期的 Embedding
const originalCount = storage.embeddings.length;
storage.embeddings = storage.embeddings.filter(e => (now - e.timestamp) < expiryMs);
const expiredCount = originalCount - storage.embeddings.length;

// ============== 主处理逻辑 ==============

// 准备内容文本
const itemsWithText = items.map((item, index) => ({
  item,
  index,
  text: getContentText(item),
  id: getContentId(item)
})).filter(entry => entry.text.length > 10); // 过滤空内容

if (itemsWithText.length === 0) {
  console.log('Semantic Dedupe: No valid content to process');
  return items;
}

// 批量获取 Embedding
const allTexts = itemsWithText.map(e => e.text);
const allEmbeddings = [];

for (const batch of chunk(allTexts, BATCH_SIZE)) {
  const batchEmbeddings = await getEmbeddings(batch);
  allEmbeddings.push(...batchEmbeddings);
  // 添加小延迟避免API限流
  if (batch.length === BATCH_SIZE) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

// 如果 Embedding 获取失败，返回原始内容
if (allEmbeddings.length !== itemsWithText.length) {
  console.log(`Semantic Dedupe: Embedding count mismatch (${allEmbeddings.length} vs ${itemsWithText.length}), skipping`);
  return items;
}

// 为每个条目添加 Embedding
itemsWithText.forEach((entry, i) => {
  entry.embedding = allEmbeddings[i];
});

// 与历史 Embedding 比较，找出重复
const unique = [];
const duplicates = [];
const newEmbeddings = [];

for (const entry of itemsWithText) {
  if (!entry.embedding || entry.embedding.length === 0) {
    unique.push(entry.item);
    continue;
  }

  let isDuplicate = false;
  let maxSimilarity = 0;
  let mostSimilarTitle = '';

  // 与历史 Embedding 比较
  for (const historical of storage.embeddings) {
    const similarity = cosineSimilarity(entry.embedding, historical.embedding);
    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
      mostSimilarTitle = historical.title || '';
    }
    if (similarity >= SIMILARITY_THRESHOLD) {
      isDuplicate = true;
      break;
    }
  }

  // 与本批次已通过的内容比较（防止批内重复）
  if (!isDuplicate) {
    for (const newEmb of newEmbeddings) {
      const similarity = cosineSimilarity(entry.embedding, newEmb.embedding);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        mostSimilarTitle = newEmb.title || '';
      }
      if (similarity >= SIMILARITY_THRESHOLD) {
        isDuplicate = true;
        break;
      }
    }
  }

  if (isDuplicate) {
    duplicates.push({
      title: entry.item.json?.title || entry.text.slice(0, 50),
      similarity: maxSimilarity,
      similarTo: mostSimilarTitle
    });
  } else {
    unique.push(entry.item);
    // 添加到新 Embedding 列表
    newEmbeddings.push({
      id: entry.id,
      embedding: entry.embedding,
      title: String(entry.item.json?.title || entry.text.slice(0, 80)),
      timestamp: now
    });
  }
}

// 更新存储
storage.embeddings.push(...newEmbeddings);

// 如果超过最大存储量，删除最旧的
if (storage.embeddings.length > MAX_EMBEDDINGS) {
  storage.embeddings.sort((a, b) => b.timestamp - a.timestamp);
  storage.embeddings = storage.embeddings.slice(0, MAX_EMBEDDINGS);
}

// 同步到 staticData
if (storage._staticData) {
  storage._staticData.semanticEmbeddings = storage.embeddings;
}

// ============== 输出统计 ==============

const stats = {
  input_count: items.length,
  processed_count: itemsWithText.length,
  unique_count: unique.length,
  duplicate_count: duplicates.length,
  similarity_threshold: SIMILARITY_THRESHOLD,
  expired_cleaned: expiredCount,
  total_stored_embeddings: storage.embeddings.length,
  storage_mode: storageMode,
  embedding_model: EMBEDDING_MODEL,
  file_store_enabled: FILE_STORE_ENABLED,
  file_store_saved: fileStore ? saveFileStore({ embeddings: storage.embeddings }) : false
};

console.log('Semantic Dedupe Stats:', JSON.stringify(stats));

if (DEBUG && duplicates.length > 0) {
  console.log('Semantic Duplicates Found:');
  duplicates.forEach(d => {
    console.log(`  - "${d.title.slice(0, 40)}..." (similarity: ${d.similarity.toFixed(3)}) similar to "${d.similarTo.slice(0, 40)}..."`);
  });
}

// 返回去重后的内容
return unique;
