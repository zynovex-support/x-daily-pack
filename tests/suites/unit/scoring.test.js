/**
 * 评分逻辑单元测试
 */

const { assert } = require('../../lib/assertions');
const { request } = require('../../lib/http-client');
const config = require('../../config/test.config');

const testData = [
  {
    id: 1,
    title: 'OpenAI发布GPT-5，支持多模态推理',
    snippet: 'OpenAI今日宣布发布GPT-5模型',
    source: 'OpenAI News',
    expectedCategory: 'announcement',
    expectedScoreMin: 24
  },
  {
    id: 2,
    title: 'GitHub trending: 新AI工具库',
    snippet: '一个新的Python库用于AI开发',
    source: 'GitHub Trending',
    expectedCategory: 'tool',
    expectedScoreMax: 20
  }
];

// Phase 2.5: Tier boost configuration (mirrors llm-rank-node.js)
const TIER_BOOST = {
  'A': { impact: 2, actionability: 1 },
  'B': { impact: 0, actionability: 0 },
  'C': { impact: -1, actionability: -1 },
  'D': { impact: -2, actionability: -1 }
};

// Apply tier boost to a score object
function applyTierBoost(score, tier) {
  const boost = TIER_BOOST[tier] || TIER_BOOST['B'];
  const adjustedImpact = Math.max(0, Math.min(9, score.impact + boost.impact));
  const adjustedActionability = Math.max(0, Math.min(7, score.actionability + boost.actionability));
  return {
    ...score,
    impact: adjustedImpact,
    actionability: adjustedActionability,
    total: score.timeliness + adjustedImpact + adjustedActionability + score.relevance,
    tierBoost: boost.impact + boost.actionability
  };
}

async function callOpenAI(items) {
  const prompt = `你是AI行业情报分析师。评分以下内容：

【评分维度】（总分30分）
1. timeliness 时效性 (0-6分)
2. impact 影响力 (0-9分)
   - 9分: 行业变革级（新模型发布）
   - 3-4分: GitHub trending工具/小库（除非突破性项目）
3. actionability 可行动性 (0-7分)
   - 7分: 官方API/SDK更新
   - 3-4分: GitHub工具需评估成熟度
4. relevance 相关性 (0-8分)

内容：${JSON.stringify(items)}

返回JSON: {"items":[{"id":1,"timeliness":5,"impact":4,"actionability":4,"relevance":5,"total":18,"category":"tool"}]}`;

  const res = await request('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apis.openai}`,
      'Content-Type': 'application/json'
    },
    body: {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      response_format: { type: 'json_object' }
    }
  });

  return JSON.parse(res.data.choices[0].message.content);
}

module.exports = {
  name: 'Scoring Logic',

  tests: [
    {
      name: 'OpenAI API连接',
      run: async () => {
        assert.ok(config.apis.openai, 'Missing OPENAI_API_KEY');
      }
    },
    {
      name: '评分维度完整性',
      run: async () => {
        const result = await callOpenAI(testData.slice(0, 1));
        const item = result.items[0];
        for (const dim of config.scoring.dimensions) {
          assert.hasProperty(item, dim, `Missing dimension: ${dim}`);
          assert.isType(item[dim], 'number');
        }
      }
    },
    {
      name: '分类标签有效性',
      run: async () => {
        const result = await callOpenAI(testData.slice(0, 1));
        const item = result.items[0];
        assert.includes(config.scoring.categories, item.category);
      }
    },
    {
      name: '官方公告高分',
      run: async () => {
        const result = await callOpenAI([testData[0]]);
        assert.greaterThan(result.items[0].total, 23, 'Official announcement should score > 23');
      }
    },
    {
      name: 'GitHub工具分数合理',
      run: async () => {
        const result = await callOpenAI([testData[1]]);
        const score = result.items[0].total;
        assert.inRange(score, 10, 25, `GitHub tool score ${score} should be 10-25`);
      }
    },
    {
      name: 'Tier A加权正确 (+3分)',
      run: async () => {
        const baseScore = { timeliness: 4, impact: 5, actionability: 4, relevance: 5 };
        const boosted = applyTierBoost(baseScore, 'A');
        assert.equal(boosted.impact, 7, 'Tier A impact should be +2');
        assert.equal(boosted.actionability, 5, 'Tier A actionability should be +1');
        assert.equal(boosted.tierBoost, 3, 'Tier A total boost should be +3');
      }
    },
    {
      name: 'Tier C加权正确 (-2分)',
      run: async () => {
        const baseScore = { timeliness: 4, impact: 5, actionability: 4, relevance: 5 };
        const boosted = applyTierBoost(baseScore, 'C');
        assert.equal(boosted.impact, 4, 'Tier C impact should be -1');
        assert.equal(boosted.actionability, 3, 'Tier C actionability should be -1');
        assert.equal(boosted.tierBoost, -2, 'Tier C total boost should be -2');
      }
    },
    {
      name: 'Tier A vs Tier C差距5分',
      run: async () => {
        const baseScore = { timeliness: 4, impact: 5, actionability: 4, relevance: 5 };
        const tierA = applyTierBoost(baseScore, 'A');
        const tierC = applyTierBoost(baseScore, 'C');
        const diff = tierA.total - tierC.total;
        assert.equal(diff, 5, `Tier A should be 5 points higher than Tier C, got ${diff}`);
      }
    },
    {
      name: 'Tier加权边界值正确',
      run: async () => {
        // Test impact cap at 9
        const highImpact = { timeliness: 4, impact: 8, actionability: 6, relevance: 5 };
        const boostedHigh = applyTierBoost(highImpact, 'A');
        assert.equal(boostedHigh.impact, 9, 'Impact should cap at 9');

        // Test impact floor at 0
        const lowImpact = { timeliness: 4, impact: 1, actionability: 1, relevance: 5 };
        const boostedLow = applyTierBoost(lowImpact, 'D');
        assert.equal(boostedLow.impact, 0, 'Impact should floor at 0');
        assert.equal(boostedLow.actionability, 0, 'Actionability should floor at 0');
      }
    }
  ]
};
