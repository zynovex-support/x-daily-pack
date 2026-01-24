#!/usr/bin/env node
/**
 * Phase 2.2 评分系统测试
 *
 * 测试4维度评分 (timeliness, impact, actionability, relevance) 和6类分类
 *
 * 禁止截图读图 - 所有验证通过结构化JSON输出
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// 加载环境变量
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && !key.startsWith('#')) {
      process.env[key.trim()] = vals.join('=').trim();
    }
  });
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

if (!OPENAI_API_KEY) {
  console.error('❌ 缺少 OPENAI_API_KEY');
  process.exit(1);
}

// 测试数据：模拟不同类型的内容
const testItems = [
  {
    id: 1,
    title: "OpenAI发布GPT-5，支持多模态推理和长上下文",
    snippet: "OpenAI今日宣布发布GPT-5模型，具备100万token上下文窗口，支持图像、音频、视频多模态输入",
    source: "OpenAI News",
    expected_category: "announcement",
    expected_score_range: [24, 30]
  },
  {
    id: 2,
    title: "如何用Claude构建自动化工作流：完整教程",
    snippet: "本文提供完整的代码示例和API调用方法，教你在30分钟内构建一个AI驱动的文档处理流水线",
    source: "Simon Willison",
    expected_category: "tool",
    expected_score_range: [20, 28]
  },
  {
    id: 3,
    title: "AI将改变世界：专家观点",
    snippet: "多位专家讨论AI技术的未来发展趋势和社会影响",
    source: "TechCrunch",
    expected_category: "insight",
    expected_score_range: [8, 16]
  },
  {
    id: 4,
    title: "某AI初创公司完成5000万美元B轮融资",
    snippet: "投资由红杉资本领投，将用于团队扩张和产品研发",
    source: "VentureBeat",
    expected_category: "case",
    expected_score_range: [10, 18]
  },
  {
    id: 5,
    title: "新研究：Transformer架构的效率优化方法",
    snippet: "论文提出新的注意力机制，在保持精度的同时将推理速度提升3倍，开源代码已发布在GitHub",
    source: "arXiv",
    expected_category: "research",
    expected_score_range: [16, 24]
  }
];

// OpenAI API调用
async function callOpenAI(items) {
  const payloadItems = items.map(item => ({
    id: item.id,
    title: item.title,
    snippet: item.snippet,
    source: item.source
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
   9分: 行业变革级（新模型发布、重大政策）
   7-8分: 重大产品更新（GPT/Claude/Gemini新功能）
   5-6分: 普通功能更新/工具发布
   3-4分: 小工具/库/插件
   1-2分: 讨论/观点/评论

3. actionability 可行动性 (0-7分)
   7分: 可直接应用（有代码/API/教程）
   5-6分: 需要适配但可落地
   3-4分: 有参考价值
   1-2分: 纯理论/概念

4. relevance 相关性 (0-8分)
   8分: 直接影响商业决策（定价、竞品、市场）
   6-7分: 工作流/效率提升
   4-5分: 产品架构/技术选型
   2-3分: 一般AI新闻
   1分: 边缘相关

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

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: '你是一个专业的内容策展专家。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' }
    });

    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.error) {
            reject(new Error(response.error.message));
            return;
          }
          const content = response.choices?.[0]?.message?.content;
          const parsed = JSON.parse(content);
          resolve(parsed.items || parsed);
        } catch (e) {
          reject(new Error(`解析失败: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// 验证评分结果
function validateResults(scores, testItems) {
  const results = {
    passed: 0,
    failed: 0,
    details: []
  };

  for (const item of testItems) {
    const score = scores.find(s => s.id === item.id);
    if (!score) {
      results.failed++;
      results.details.push({
        id: item.id,
        title: item.title,
        status: 'FAIL',
        reason: '未找到评分结果'
      });
      continue;
    }

    const checks = [];

    // 检查4维度是否存在
    const hasDimensions =
      typeof score.timeliness === 'number' &&
      typeof score.impact === 'number' &&
      typeof score.actionability === 'number' &&
      typeof score.relevance === 'number';

    if (!hasDimensions) {
      checks.push('缺少4维度评分');
    }

    // 检查分类
    const validCategories = ['announcement', 'insight', 'tool', 'case', 'research', 'risk'];
    if (!validCategories.includes(score.category)) {
      checks.push(`分类无效: ${score.category}`);
    }

    // 检查总分范围
    const [minScore, maxScore] = item.expected_score_range;
    if (score.total < minScore || score.total > maxScore) {
      checks.push(`总分${score.total}不在预期范围[${minScore}-${maxScore}]`);
    }

    // 检查分类是否匹配
    if (score.category !== item.expected_category) {
      checks.push(`分类${score.category}与预期${item.expected_category}不匹配(可接受)`);
    }

    if (checks.length === 0 || (checks.length === 1 && checks[0].includes('可接受'))) {
      results.passed++;
      results.details.push({
        id: item.id,
        title: item.title.substring(0, 30) + '...',
        status: 'PASS',
        score: {
          timeliness: score.timeliness,
          impact: score.impact,
          actionability: score.actionability,
          relevance: score.relevance,
          total: score.total,
          category: score.category
        },
        why: score.why
      });
    } else {
      results.failed++;
      results.details.push({
        id: item.id,
        title: item.title.substring(0, 30) + '...',
        status: 'FAIL',
        reason: checks.join('; '),
        score: score
      });
    }
  }

  return results;
}

// 主函数
async function main() {
  console.log('========================================');
  console.log('  Phase 2.2 评分系统测试');
  console.log('  ' + new Date().toISOString());
  console.log('========================================\n');

  console.log(`📝 测试项目: ${testItems.length} 条内容`);
  console.log(`🤖 模型: ${MODEL}\n`);

  try {
    console.log('⏳ 调用 OpenAI API 进行评分...\n');
    const scores = await callOpenAI(testItems);

    console.log('📊 评分结果:');
    console.log(JSON.stringify(scores, null, 2));
    console.log('');

    const validation = validateResults(scores, testItems);

    console.log('========================================');
    console.log('  验证结果');
    console.log('========================================\n');

    for (const detail of validation.details) {
      const icon = detail.status === 'PASS' ? '✅' : '❌';
      console.log(`${icon} [${detail.id}] ${detail.title}`);
      if (detail.status === 'PASS') {
        const s = detail.score;
        console.log(`   总分: ${s.total}/30 | 时效${s.timeliness} 影响${s.impact} 可行动${s.actionability} 相关${s.relevance}`);
        console.log(`   分类: ${s.category} | ${detail.why}`);
      } else {
        console.log(`   原因: ${detail.reason}`);
      }
      console.log('');
    }

    console.log('========================================');
    console.log(`  测试完成: ${validation.passed} 通过, ${validation.failed} 失败`);
    console.log('========================================');

    // 保存结果到日志
    const logDir = path.join(__dirname, '..', 'logs', 'tests');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = path.join(logDir, `phase2-scoring-${timestamp}.json`);
    fs.writeFileSync(logFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      model: MODEL,
      testItems: testItems.length,
      scores,
      validation
    }, null, 2));
    console.log(`\n📁 结果已保存: ${logFile}`);

    process.exit(validation.failed > 0 ? 1 : 0);

  } catch (error) {
    console.error(`\n❌ 测试失败: ${error.message}`);
    process.exit(1);
  }
}

main();
