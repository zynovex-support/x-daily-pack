// Event Clustering Node
// 使用 DBSCAN 算法对相似内容进行聚类，将同一事件的多篇报道合并为"事件视图"
//
// 工作流程：
// 1. 接收带有 Embedding 的内容（来自 Semantic Dedupe）
// 2. 使用 DBSCAN 算法聚类（相似度 0.70-0.85 的内容）
// 3. 为每个聚类生成事件标签
// 4. 输出聚类结果 + 独立内容

const items = $input.all();
const apiKey = $env.OPENAI_API_KEY;

// 配置参数
const ENABLED = $env.EVENT_CLUSTERING_ENABLED !== 'false';
const EPS = Number.parseFloat($env.EVENT_CLUSTERING_EPS || '0.25'); // 距离阈值 (1 - 0.75相似度)
const MIN_PTS = Number.parseInt($env.EVENT_CLUSTERING_MIN_PTS || '2', 10);
const MAX_CLUSTER_SIZE = Number.parseInt($env.EVENT_CLUSTERING_MAX_SIZE || '8', 10);
const DEBUG = $env.EVENT_CLUSTERING_DEBUG === 'true';

// 如果禁用或无数据，直接返回
if (!ENABLED) {
  console.log('[EventClustering] Disabled, passing through');
  return items;
}

if (items.length === 0) {
  return [];
}

if (items.length < MIN_PTS) {
  console.log(`[EventClustering] Too few items (${items.length}), skipping clustering`);
  return items.map(item => ({
    json: { ...item.json, cluster: null, isNoise: true }
  }));
}

// ============== 工具函数 ==============

// 余弦相似度计算（复用 semantic-dedupe 的实现）
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

// 余弦距离 = 1 - 余弦相似度
const cosineDistance = (a, b) => 1 - cosineSimilarity(a, b);

// 生成唯一聚类ID
const generateClusterId = () => `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

// ============== DBSCAN 算法实现 ==============

// 查找邻居：返回距离小于 eps 的所有点的索引
const regionQuery = (points, pointIdx, eps) => {
  const neighbors = [];
  const point = points[pointIdx];

  for (let i = 0; i < points.length; i++) {
    if (i === pointIdx) continue;
    const distance = cosineDistance(point.embedding, points[i].embedding);
    if (distance <= eps) {
      neighbors.push(i);
    }
  }
  return neighbors;
};

// 扩展聚类
const expandCluster = (points, labels, pointIdx, neighbors, clusterId, eps, minPts, maxSize) => {
  labels[pointIdx] = clusterId;
  let clusterSize = 1;

  const queue = [...neighbors];
  const visited = new Set([pointIdx]);

  while (queue.length > 0 && clusterSize < maxSize) {
    const currentIdx = queue.shift();
    if (visited.has(currentIdx)) continue;
    visited.add(currentIdx);

    // 如果该点之前是噪声，加入当前聚类
    if (labels[currentIdx] === -1) {
      labels[currentIdx] = clusterId;
      clusterSize++;
    }

    // 如果该点未被分配，加入当前聚类
    if (labels[currentIdx] === 0) {
      labels[currentIdx] = clusterId;
      clusterSize++;

      // 查找该点的邻居
      const newNeighbors = regionQuery(points, currentIdx, eps);
      if (newNeighbors.length >= minPts - 1) {
        // 核心点，扩展邻居
        for (const n of newNeighbors) {
          if (!visited.has(n)) {
            queue.push(n);
          }
        }
      }
    }
  }

  return clusterSize;
};

// DBSCAN 主函数
const dbscan = (points, eps, minPts, maxSize) => {
  const n = points.length;
  const labels = new Array(n).fill(0); // 0=未访问, -1=噪声, >0=聚类ID
  let clusterId = 0;

  for (let i = 0; i < n; i++) {
    // 跳过已处理的点
    if (labels[i] !== 0) continue;

    // 查找邻居
    const neighbors = regionQuery(points, i, eps);

    if (neighbors.length < minPts - 1) {
      // 标记为噪声（可能后续被其他聚类吸收）
      labels[i] = -1;
    } else {
      // 创建新聚类
      clusterId++;
      expandCluster(points, labels, i, neighbors, clusterId, eps, minPts, maxSize);
    }
  }

  return labels;
};

// ============== LLM 标签生成 ==============

// 为聚类生成事件标签
const generateClusterLabel = async (articles) => {
  if (!apiKey) {
    // 无API Key时使用简单标签
    return articles[0].title.slice(0, 30) + '...';
  }

  const titles = articles.map(a => `- ${a.title}`).join('\n');
  const prompt = `以下是关于同一事件的多篇报道标题，请用一个简短的中文短语（10字以内）概括这个事件的核心主题：

${titles}

只输出事件标签，不要任何解释。`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 50,
        temperature: 0.3
      })
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || articles[0].title.slice(0, 30);
  } catch (error) {
    console.log(`[EventClustering] Label generation failed: ${error.message}`);
    return articles[0].title.slice(0, 30);
  }
};

// ============== 主执行逻辑 ==============

// 准备数据点（需要有 embedding）
const points = items.map((item, idx) => ({
  idx,
  embedding: item.json.embedding,
  title: item.json.title || '',
  url: item.json.url || '',
  source: item.json.source || '',
  score: item.json.score || 0,
  tier: item.json.tier || '',
  category: item.json.category || ''
}));

// 过滤没有 embedding 的项
const validPoints = points.filter(p => p.embedding && Array.isArray(p.embedding));
const invalidItems = points.filter(p => !p.embedding || !Array.isArray(p.embedding));

if (DEBUG) {
  console.log(`[EventClustering] Valid points: ${validPoints.length}, Invalid: ${invalidItems.length}`);
}

if (validPoints.length < MIN_PTS) {
  console.log(`[EventClustering] Not enough valid embeddings (${validPoints.length}), skipping`);
  return items.map(item => ({
    json: { ...item.json, cluster: null, isNoise: true }
  }));
}

// 执行 DBSCAN 聚类
const labels = dbscan(validPoints, EPS, MIN_PTS, MAX_CLUSTER_SIZE);

// 统计聚类结果
const clusterMap = new Map(); // clusterId -> [pointIndices]
let noiseCount = 0;

for (let i = 0; i < labels.length; i++) {
  const label = labels[i];
  if (label === -1) {
    noiseCount++;
  } else if (label > 0) {
    if (!clusterMap.has(label)) {
      clusterMap.set(label, []);
    }
    clusterMap.get(label).push(i);
  }
}

if (DEBUG) {
  console.log(`[EventClustering] Found ${clusterMap.size} clusters, ${noiseCount} noise points`);
}

// 构建聚类对象并生成标签
const clusters = [];

for (const [clusterId, pointIndices] of clusterMap) {
  const articles = pointIndices.map(i => validPoints[i]);

  // 按分数排序，最高分的作为代表
  articles.sort((a, b) => b.score - a.score);

  const cluster = {
    clusterId: generateClusterId(),
    articles: articles.map(a => ({
      url: a.url,
      title: a.title,
      source: a.source,
      score: a.score,
      tier: a.tier,
      category: a.category
    })),
    representativeTitle: articles[0].title,
    articleCount: articles.length,
    avgScore: articles.reduce((sum, a) => sum + a.score, 0) / articles.length,
    maxScore: articles[0].score
  };

  clusters.push({ cluster, pointIndices });
}

// 为每个聚类生成标签（并行处理）
const labelPromises = clusters.map(async ({ cluster }) => {
  cluster.label = await generateClusterLabel(cluster.articles);
  return cluster;
});

const labeledClusters = await Promise.all(labelPromises);

// 构建聚类索引映射
const pointToCluster = new Map();
for (const { cluster, pointIndices } of clusters) {
  for (const idx of pointIndices) {
    pointToCluster.set(idx, cluster);
  }
}

// 准备输出
const output = [];

// 添加聚类中的项（带聚类信息）
for (let i = 0; i < validPoints.length; i++) {
  const point = validPoints[i];
  const originalItem = items[point.idx];
  const cluster = pointToCluster.get(i);

  if (cluster) {
    // 属于某个聚类
    output.push({
      json: {
        ...originalItem.json,
        cluster: {
          clusterId: cluster.clusterId,
          label: cluster.label,
          articleCount: cluster.articleCount,
          avgScore: cluster.avgScore,
          isRepresentative: cluster.articles[0].url === point.url
        },
        isNoise: false
      }
    });
  } else {
    // 噪声点（独立内容）
    output.push({
      json: {
        ...originalItem.json,
        cluster: null,
        isNoise: true
      }
    });
  }
}

// 添加无效项（没有 embedding 的）
for (const point of invalidItems) {
  const originalItem = items[point.idx];
  output.push({
    json: {
      ...originalItem.json,
      cluster: null,
      isNoise: true,
      clusteringSkipped: true
    }
  });
}

// 输出统计
console.log(`[EventClustering] Results: ${clusterMap.size} clusters, ${noiseCount} noise, ${invalidItems.length} skipped`);

if (DEBUG) {
  for (const cluster of labeledClusters) {
    console.log(`  Cluster "${cluster.label}": ${cluster.articleCount} articles, avg score ${cluster.avgScore.toFixed(1)}`);
  }
}

return output;
