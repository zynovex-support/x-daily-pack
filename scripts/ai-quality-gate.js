/**
 * AI Quality Gate - 内容质量守门员
 * Phase 3: AI 增强 - 检测低质量/可疑内容
 *
 * 功能：
 * - 事实可信度评估
 * - 偏见风险检测
 * - 垃圾内容过滤
 * - 自动标记需人工审核的内容
 */

const { ChatOpenAI } = require('@langchain/openai');

// 质量检查 Prompt
const QUALITY_CHECK_PROMPT = `你是一个专业的内容质量分析师。分析以下新闻内容，返回 JSON 格式评估。

评估维度：
1. factuality (0-10): 事实可信度 - 基于来源可靠性、是否有具体数据支撑
2. bias_risk: 偏见风险 - "low" / "medium" / "high"
3. spam_score (0-10): 垃圾内容分数 - 广告、推广、无实质内容
4. recommendation: 处理建议 - "pass" / "review" / "reject"

判断标准：
- pass: factuality >= 7, bias_risk = low, spam_score <= 3
- reject: factuality <= 3 OR spam_score >= 8
- review: 其他情况

内容：
标题: {title}
来源: {source}
摘要: {content}

仅返回 JSON，不要其他文字：
{
  "factuality": <number>,
  "bias_risk": "<string>",
  "spam_score": <number>,
  "recommendation": "<string>",
  "reason": "<简短原因>"
}`;

/**
 * 执行质量检查
 */
async function checkQuality(items, options = {}) {
  const {
    apiKey = process.env.OPENAI_API_KEY,
    model = process.env.OPENAI_MODEL || 'gpt-4o-mini',
    batchSize = 5,
    debug = false
  } = options;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required');
  }

  const llm = new ChatOpenAI({
    openAIApiKey: apiKey,
    modelName: model,
    temperature: 0.1,
    maxTokens: 500
  });

  const results = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (item) => {
        try {
          const prompt = QUALITY_CHECK_PROMPT
            .replace('{title}', item.title || '')
            .replace('{source}', item.source || item.feedName || 'Unknown')
            .replace('{content}', (item.content || item.description || '').slice(0, 500));

          const response = await llm.invoke(prompt);
          const content = response.content;

          // 解析 JSON 响应
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error('Invalid JSON response');
          }

          const quality = JSON.parse(jsonMatch[0]);

          if (debug) {
            console.log(`[QualityGate] ${item.title?.slice(0, 50)}... => ${quality.recommendation}`);
          }

          return {
            ...item,
            qualityCheck: {
              ...quality,
              checkedAt: new Date().toISOString()
            }
          };
        } catch (err) {
          console.error(`[QualityGate] Error checking item: ${err.message}`);
          return {
            ...item,
            qualityCheck: {
              factuality: 5,
              bias_risk: 'medium',
              spam_score: 5,
              recommendation: 'review',
              reason: 'Quality check failed',
              error: err.message
            }
          };
        }
      })
    );

    results.push(...batchResults);

    // 避免 API 限流
    if (i + batchSize < items.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return results;
}

/**
 * 过滤通过质量检查的内容
 */
function filterByQuality(items, minRecommendation = 'review') {
  const validRecommendations = {
    'pass': ['pass'],
    'review': ['pass', 'review'],
    'reject': ['pass', 'review', 'reject']
  };

  const allowed = validRecommendations[minRecommendation] || ['pass', 'review'];

  return items.filter(item => {
    const rec = item.qualityCheck?.recommendation || 'review';
    return allowed.includes(rec);
  });
}

/**
 * 获取质量统计
 */
function getQualityStats(items) {
  const stats = {
    total: items.length,
    pass: 0,
    review: 0,
    reject: 0,
    avgFactuality: 0,
    avgSpamScore: 0
  };

  let factSum = 0;
  let spamSum = 0;

  for (const item of items) {
    const qc = item.qualityCheck;
    if (!qc) continue;

    stats[qc.recommendation] = (stats[qc.recommendation] || 0) + 1;
    factSum += qc.factuality || 0;
    spamSum += qc.spam_score || 0;
  }

  if (items.length > 0) {
    stats.avgFactuality = (factSum / items.length).toFixed(2);
    stats.avgSpamScore = (spamSum / items.length).toFixed(2);
  }

  return stats;
}

module.exports = {
  checkQuality,
  filterByQuality,
  getQualityStats,
  QUALITY_CHECK_PROMPT
};
