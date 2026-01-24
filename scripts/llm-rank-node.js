// LLM Ranking Node Code for n8n
// Batch-ranks content using OpenAI API to avoid timeouts

const items = $input.all();
const apiKey = $env.OPENAI_API_KEY;
const model = $env.OPENAI_MODEL || 'gpt-4o-mini';
const maxItems = Number.parseInt($env.LLM_RANK_MAX_ITEMS || '40', 10);
const batchSize = Number.parseInt($env.LLM_RANK_BATCH_SIZE || '8', 10);
const xRatioRaw = Number.parseFloat($env.LLM_RANK_X_RATIO || '0.4');
const xRatio = Number.isFinite(xRatioRaw) ? Math.min(1, Math.max(0, xRatioRaw)) : 0.4;
const xAppliedCap = Number.parseInt($env.LLM_RANK_X_PER_SOURCE_CAP_APPLIED || '4', 10);
const xResearchCap = Number.parseInt($env.LLM_RANK_X_PER_SOURCE_CAP_RESEARCH || '1', 10);
const xDefaultCap = Number.parseInt($env.LLM_RANK_X_PER_SOURCE_CAP_DEFAULT || '2', 10);

// Low-score filtering threshold (default: 18/30 = 60%)
const minScoreThreshold = Number.parseInt($env.LLM_RANK_MIN_SCORE || '18', 10);
// Per-source cap to prevent one source dominating the output
const perSourceCap = Number.parseInt($env.LLM_RANK_PER_SOURCE_CAP || '3', 10);

// Feedback learning integration
const feedbackLearningEnabled = $env.FEEDBACK_LEARNING_ENABLED !== 'false';
let learnedWeights = { categoryBoosts: {}, sourceBoosts: {} };

if (feedbackLearningEnabled) {
  try {
    const storage = this.getWorkflowStaticData
      ? this.getWorkflowStaticData('global')
      : this.helpers?.getWorkflowStaticData?.call(this, 'global');
    if (storage?.learnedWeights) {
      learnedWeights = storage.learnedWeights;
      console.log(`[LLMRank] Loaded learned weights v${learnedWeights.version || 0}`);
    }
  } catch (err) {
    console.log('[LLMRank] Cannot load learned weights:', err.message);
  }
}

const getLearnedBoost = (category, source) => {
  let boost = 0;
  if (learnedWeights.categoryBoosts?.[category]) {
    boost += learnedWeights.categoryBoosts[category];
  }
  if (learnedWeights.sourceBoosts?.[source]) {
    boost += learnedWeights.sourceBoosts[source];
  }
  return boost;
};

if (!apiKey) {
  throw new Error('Missing OPENAI_API_KEY for LLM Rank.');
}

const normalizeText = (value, maxLen) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!maxLen) return text;
  return text.length > maxLen ? text.slice(0, maxLen) : text;
};

const metricScore = (metrics = {}) => {
  const like = Number(metrics.like_count || 0);
  const rt = Number(metrics.retweet_count || 0);
  const quote = Number(metrics.quote_count || 0);
  const reply = Number(metrics.reply_count || 0);
  const impression = Number(metrics.impression_count || 0);
  return like + rt * 2 + quote * 1.5 + reply * 0.5 + impression * 0.05;
};

const parseTime = (value) => {
  if (!value) return 0;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
};

const prepped = items.map((item, index) => {
  const data = item.json || {};
  const metrics = data.metrics || data.public_metrics || {};
  const source = data.source || '';
  const sourceType = data.sourceType || (source.startsWith('X -') ? 'X' : 'RSS');
  return {
    index,
    data,
    metricScore: metricScore(metrics),
    sourceType,
    publishedAtScore: parseTime(data.publishedAt || data.created_at || data.pubDate || data.isoDate)
  };
});

const maxItemsSafe = Math.max(1, Math.min(maxItems, prepped.length));

const xItems = prepped.filter((entry) => entry.sourceType === 'X');
const rssItems = prepped.filter((entry) => entry.sourceType !== 'X');

xItems.sort((a, b) => b.metricScore - a.metricScore);

// RSS按Tier优先排序，同Tier按时间排序（确保Tier A官方源优先进入评分）
const tierPriority = { 'A': 4, 'B': 3, 'C': 2, 'D': 1 };
rssItems.sort((a, b) => {
  const tierA = tierPriority[a.data.tier] || 2;
  const tierB = tierPriority[b.data.tier] || 2;
  if (tierA !== tierB) return tierB - tierA;
  return b.publishedAtScore - a.publishedAtScore;
});

let xQuota = Math.min(xItems.length, Math.round(maxItemsSafe * xRatio));
let rssQuota = Math.min(rssItems.length, maxItemsSafe - xQuota);
if (rssQuota < maxItemsSafe - xQuota) {
  xQuota = Math.min(xItems.length, maxItemsSafe - rssQuota);
}

// High-value applied/practical sources - give them higher quota
const appliedSources = new Set([
  'X - ai-agents',
  'X - ai-workflow',
  'X - llm-prompts',
  'X - ai-built',        // NEW: developers shipping things
  'X - ai-freebies',     // NEW: free resources
  'X - buildinpublic',   // NEW: indie hackers
  'X - ai-tips',         // NEW: practical tips
  'X - @simonw',
  'X - @swyx',
  'X - @hwchase17',
  'X - @goodside'
]);
// Lower priority research/theory sources
const researchSources = new Set([
  'X - @ylecun',
  'X - @sama'  // often macro commentary
]);

const xBuckets = new Map();
xItems.forEach((entry) => {
  const key = entry.data.source || 'X';
  if (!xBuckets.has(key)) xBuckets.set(key, []);
  xBuckets.get(key).push(entry);
});

const xSelected = [];
const pickedIndexes = new Set();

for (const [source, bucket] of xBuckets.entries()) {
  bucket.sort((a, b) => b.metricScore - a.metricScore);
  let cap = xDefaultCap;
  if (appliedSources.has(source)) cap = xAppliedCap;
  if (researchSources.has(source)) cap = xResearchCap;
  for (const entry of bucket.slice(0, cap)) {
    if (xSelected.length >= xQuota) break;
    if (pickedIndexes.has(entry.index)) continue;
    pickedIndexes.add(entry.index);
    xSelected.push(entry);
  }
  if (xSelected.length >= xQuota) break;
}

if (xSelected.length < xQuota) {
  for (const entry of xItems) {
    if (xSelected.length >= xQuota) break;
    if (pickedIndexes.has(entry.index)) continue;
    pickedIndexes.add(entry.index);
    xSelected.push(entry);
  }
}

const selected = xSelected.concat(rssItems.slice(0, rssQuota));

const chunk = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

const parseJson = (content) => {
  if (!content) return null;
  const trimmed = String(content).trim();
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const objStart = trimmed.indexOf('{');
    const objEnd = trimmed.lastIndexOf('}');
    if (objStart >= 0 && objEnd > objStart) {
      try {
        return JSON.parse(trimmed.slice(objStart, objEnd + 1));
      } catch (err) {
        // ignore and try array
      }
    }
    const arrStart = trimmed.indexOf('[');
    const arrEnd = trimmed.lastIndexOf(']');
    if (arrStart >= 0 && arrEnd > arrStart) {
      try {
        return JSON.parse(trimmed.slice(arrStart, arrEnd + 1));
      } catch (err) {
        return null;
      }
    }
  }
  return null;
};

const rankedItems = [];
let failedBatches = 0;

for (const group of chunk(selected, Math.max(1, batchSize))) {
  const payloadItems = group.map((entry) => ({
    id: entry.index,
    title: normalizeText(entry.data.title || entry.data.text || '', 120),
    snippet: normalizeText(entry.data.snippet || entry.data.description || entry.data.summary || '', 280),
    source: normalizeText(entry.data.source || '', 80),
    url: normalizeText(entry.data.url || '', 160),
    source_type: entry.sourceType || 'RSS',
    tier: entry.data.tier || 'B'
  }));

  const prompt = `你是AI行业情报分析师，帮我筛选对商业决策最有价值的内容。

【评分维度】（总分30分）

1. timeliness 时效性 (0-6分)
   6分: 官方公告/产品发布（24小时内）
   5分: 重要更新/突发新闻
   4分: 本周热点/趋势分析
   3分: 深度报告/案例研究
   1-2分: 历史内容/旧闻

2. impact 影响力 (0-9分)
   9分: 行业变革级（新模型发布、重大政策、API定价变化）
   7-8分: 重大产品更新（GPT/Claude/Gemini新功能、官方SDK更新）
   5-6分: 官方工具发布/重要功能更新
   3-4分: GitHub trending工具/小库/插件（除非是突破性项目）
   1-2分: 讨论/观点/评论/普通开源项目

3. actionability 可行动性 (0-7分)
   7分: 官方API/SDK更新，可直接集成到产品
   5-6分: 有完整教程/示例，需要适配但可落地
   3-4分: 有参考价值，GitHub工具需评估是否成熟
   1-2分: 纯理论/概念/早期实验项目

4. relevance 相关性 (0-8分)
   8分: 直接影响商业决策（定价、竞品、市场）
   6-7分: 工作流/效率提升
   4-5分: 产品架构/技术选型
   2-3分: 一般AI新闻
   1分: 边缘相关

【源可信度加权】
评分时请考虑信息源的可信度层级(tier字段):

Tier A (官方源): 评分时给予更高的impact和actionability
  - 来自公司官方博客/SDK/协议
  - 信息准确性最高
  - 示例: OpenAI News, Google AI Blog, AWS ML Blog

Tier B (权威源): 正常评分
  - 专家博客、权威媒体、学术源
  - 示例: TechCrunch, MIT Tech Review, ArXiv

Tier C (社区源): 评分时更严格
  - 社区讨论、GitHub trending
  - 需要内容本身非常有价值才给高分
  - 示例: Reddit, Hacker News, GitHub Trending

Tier D (聚合源): 评分时最严格
  - 新闻聚合，可能二次转载
  - 示例: Google News

【高分内容示例】(24-30分)
✅ "OpenAI发布GPT-5" - 官方公告+行业变革+高相关
✅ "Claude新增代码执行功能" - 产品更新+可直接用
✅ "Anthropic API定价下调50%" - 直接影响商业决策

【中分内容示例】(15-23分)
⚠️ "GitHub trending: 新AI工具库" - 工具发现，需评估成熟度
⚠️ "XX公司融资1亿" - 行业动态，参考价值

【低分内容示例】(0-14分)
❌ "AI将改变世界" - 观点文章，无可行动性
❌ "论文：提出新算法" - 纯研究，除非有成熟开源实现
❌ "GitHub: 又一个LLM wrapper" - 普通开源项目，低影响力

输入数据：
${JSON.stringify(payloadItems, null, 2)}

返回JSON（不要markdown）：
{
  "items": [
    {
      "id": 0,
      "timeliness": 5,
      "impact": 7,
      "actionability": 6,
      "relevance": 7,
      "total": 25,
      "why": "一句话说明价值点",
      "category": "announcement/insight/tool/case/research/risk"
    }
  ]
}`;

  let batchScores = [];
  try {
    const response = await this.helpers.httpRequest({
      method: 'POST',
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: {
        model,
        messages: [
          { role: 'system', content: '你是一个专业的内容策展专家。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      }
    });

    const parsed = parseJson(response?.choices?.[0]?.message?.content);
    if (parsed?.items && Array.isArray(parsed.items)) {
      batchScores = parsed.items;
    } else if (Array.isArray(parsed)) {
      batchScores = parsed;
    }
  } catch (error) {
    failedBatches += 1;
  }

  const scoreMap = new Map();
  batchScores.forEach((score) => {
    if (!score || typeof score.id === 'undefined') return;
    scoreMap.set(Number(score.id), score);
  });

  group.forEach((entry) => {
    const score = scoreMap.get(entry.index);
    if (score) {
      // New 4-dimension scoring (Phase 2.2)
      const timeliness = Number(score.timeliness || score.freshness || 0);
      let impact = Number(score.impact || score.shareworthy || 0);
      let actionability = Number(score.actionability || score.practical || 0);
      const relevance = Number(score.relevance || 0);

      // Phase 2.5: Tier-based score adjustment
      const tier = entry.data.tier || 'B';
      const TIER_BOOST = {
        'A': { impact: 2, actionability: 1 },
        'B': { impact: 0, actionability: 0 },
        'C': { impact: -1, actionability: -1 },
        'D': { impact: -2, actionability: -1 }
      };
      const boost = TIER_BOOST[tier] || TIER_BOOST['B'];
      const adjustedImpact = Math.max(0, Math.min(9, impact + boost.impact));
      const adjustedActionability = Math.max(0, Math.min(7, actionability + boost.actionability));

      // Apply learned weights from user feedback
      const category = score.category || score.type || 'unknown';
      const source = entry.data.source || 'unknown';
      const learnedBoost = getLearnedBoost(category, source);

      const total = timeliness + adjustedImpact + adjustedActionability + relevance + learnedBoost;
      rankedItems.push({
        json: {
          ...entry.data,
          score: {
            timeliness,
            impact: adjustedImpact,
            actionability: adjustedActionability,
            relevance,
            total: Math.max(0, Math.min(30, total)), // 确保在0-30范围内
            why: score.why || '',
            category: category,
            tierBoost: boost.impact + boost.actionability,
            learnedBoost: learnedBoost
          }
        }
      });
    } else {
      const fallbackTotal = Math.min(30, Math.round(Math.log1p(entry.metricScore) * 6));
      rankedItems.push({
        json: {
          ...entry.data,
          score: {
            timeliness: 0,
            impact: 0,
            actionability: 0,
            relevance: 0,
            total: fallbackTotal,
            why: 'LLM未返回结果，使用互动指标估算',
            category: 'unknown'
          }
        }
      });
    }
  });
}

if (failedBatches >= Math.ceil(selected.length / Math.max(1, batchSize))) {
  throw new Error('LLM Rank failed for all batches. Check OpenAI API key/billing/connectivity.');
}

rankedItems.sort((a, b) => (b.json.score?.total || 0) - (a.json.score?.total || 0));

// Filter out low-score items (below threshold)
const filteredByScore = rankedItems.filter((item) => {
  const total = item.json.score?.total || 0;
  return total >= minScoreThreshold;
});

// Apply per-source cap to prevent one source dominating
const sourceCounts = new Map();
const filteredBySourceCap = filteredByScore.filter((item) => {
  const source = item.json.source || 'unknown';
  const count = sourceCounts.get(source) || 0;
  if (count >= perSourceCap) return false;
  sourceCounts.set(source, count + 1);
  return true;
});

// Log filtering stats for debugging
const statsLog = {
  input_count: items.length,
  selected_for_ranking: selected.length,
  after_llm_ranking: rankedItems.length,
  after_score_filter: filteredByScore.length,
  after_source_cap: filteredBySourceCap.length,
  min_score_threshold: minScoreThreshold,
  per_source_cap: perSourceCap,
  filtered_low_score: rankedItems.length - filteredByScore.length,
  filtered_source_cap: filteredByScore.length - filteredBySourceCap.length
};
console.log('LLM Rank Stats:', JSON.stringify(statsLog));

return filteredBySourceCap;
