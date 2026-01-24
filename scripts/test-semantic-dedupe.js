#!/usr/bin/env node
// 语义去重测试脚本
// 用法: node scripts/test-semantic-dedupe.js
//
// 测试场景：
// 1. 完全不同的内容 → 不应被去重
// 2. 同一事件的不同报道 → 应该被去重
// 3. 相似话题但不同内容 → 阈值边界测试

const fs = require('fs');
const path = require('path');

// 手动读取 .env 文件
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  });
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = 'text-embedding-3-small';
const SIMILARITY_THRESHOLD = 0.85;

if (!OPENAI_API_KEY) {
  console.error('Error: Missing OPENAI_API_KEY in .env');
  process.exit(1);
}

// 测试数据：模拟真实场景
const testCases = [
  // 组1：同一事件的不同报道（应该被识别为重复）
  {
    group: '同一事件-OpenAI发布',
    items: [
      { title: 'OpenAI Announces GPT-5 with Revolutionary Capabilities', snippet: 'OpenAI has unveiled GPT-5, featuring major improvements in reasoning, coding, and multimodal understanding.' },
      { title: 'GPT-5 Released by OpenAI - New AI Model Launch', snippet: 'OpenAI released GPT-5 today with enhanced capabilities in reasoning and code generation.' },
      { title: 'OpenAI unveils GPT-5: A breakthrough in AI', snippet: 'The new GPT-5 model from OpenAI brings significant advances in reasoning and multimodal tasks.' },
    ],
    expectedDuplicates: 2  // 第2、3条应该被识别为与第1条重复
  },

  // 组2：完全不同的内容（不应该被去重）
  {
    group: '完全不同的内容',
    items: [
      { title: 'New Python Library for Data Visualization', snippet: 'A new open-source Python library makes creating interactive charts easier than ever.' },
      { title: 'Tesla Announces New Electric Truck', snippet: 'Tesla unveiled its new electric semi-truck with 500 mile range and autonomous driving features.' },
      { title: 'Recipe: How to Make Perfect Sourdough Bread', snippet: 'Learn the secrets to baking artisan sourdough bread at home with this step-by-step guide.' },
    ],
    expectedDuplicates: 0  // 都不应该被去重
  },

  // 组3：相似话题但不同具体内容（边界测试）
  {
    group: 'AI Agent相关-不同产品',
    items: [
      { title: 'AutoGPT 2.0 Released with Improved Agent Architecture', snippet: 'AutoGPT releases version 2.0 featuring better memory management and tool use capabilities.' },
      { title: 'LangChain Agents Tutorial: Building Your First AI Agent', snippet: 'Step-by-step guide to building autonomous AI agents using LangChain framework.' },
      { title: 'CrewAI vs AutoGPT: Comparing Multi-Agent Frameworks', snippet: 'An in-depth comparison of CrewAI and AutoGPT for building multi-agent AI systems.' },
    ],
    expectedDuplicates: 0  // 虽然都关于AI Agent，但是不同产品，不应去重
  },

  // 组4：X推文场景-同一产品讨论
  {
    group: 'X推文-Claude讨论',
    items: [
      { title: 'Just tried Claude 3.5 Sonnet and it\'s amazing!', snippet: 'The new Claude model is incredibly good at coding. Helped me refactor my entire codebase in minutes.' },
      { title: 'Claude 3.5 Sonnet review: Best coding AI yet', snippet: 'After testing Claude 3.5 Sonnet for a week, I can say it\'s the best AI for programming tasks.' },
      { title: 'Why I switched from GPT-4 to Claude 3.5', snippet: 'Claude 3.5 Sonnet has become my daily driver for coding. Here\'s why it beats GPT-4.' },
    ],
    expectedDuplicates: 2  // 这些可能会被识别为相似（都在评价Claude coding能力）
  },
];

// 工具函数
async function getEmbeddings(texts) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts
    })
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message);
  }
  return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
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

// 主测试函数
async function runTests() {
  console.log('========================================');
  console.log('语义去重测试');
  console.log(`模型: ${EMBEDDING_MODEL}`);
  console.log(`相似度阈值: ${SIMILARITY_THRESHOLD}`);
  console.log('========================================\n');

  let totalTests = 0;
  let passedTests = 0;

  for (const testCase of testCases) {
    console.log(`\n【测试组】${testCase.group}`);
    console.log('-'.repeat(40));

    // 准备文本
    const texts = testCase.items.map(item => `${item.title}\n${item.snippet}`);

    // 获取 Embedding
    const embeddings = await getEmbeddings(texts);

    // 计算两两相似度
    const similarities = [];
    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        const sim = cosineSimilarity(embeddings[i], embeddings[j]);
        similarities.push({
          i, j,
          titleA: testCase.items[i].title.slice(0, 40),
          titleB: testCase.items[j].title.slice(0, 40),
          similarity: sim,
          isDuplicate: sim >= SIMILARITY_THRESHOLD
        });
      }
    }

    // 输出相似度矩阵
    console.log('\n相似度矩阵:');
    for (const s of similarities) {
      const status = s.isDuplicate ? '🔴 重复' : '🟢 通过';
      console.log(`  [${s.i}] vs [${s.j}]: ${s.similarity.toFixed(4)} ${status}`);
      console.log(`      "${s.titleA}..."`);
      console.log(`      "${s.titleB}..."`);
    }

    // 统计重复数量
    const duplicateCount = similarities.filter(s => s.isDuplicate).length;
    const expected = testCase.expectedDuplicates;

    totalTests++;
    if (duplicateCount === expected) {
      passedTests++;
      console.log(`\n✅ 测试通过: 检测到 ${duplicateCount} 对重复 (预期 ${expected})`);
    } else {
      console.log(`\n❌ 测试未达预期: 检测到 ${duplicateCount} 对重复 (预期 ${expected})`);
      console.log(`   注: 这可能需要调整阈值`);
    }
  }

  // 总结
  console.log('\n========================================');
  console.log('测试总结');
  console.log('========================================');
  console.log(`总测试组: ${totalTests}`);
  console.log(`通过: ${passedTests}`);
  console.log(`需调优: ${totalTests - passedTests}`);

  // 阈值建议
  console.log('\n========================================');
  console.log('阈值调优建议');
  console.log('========================================');
  console.log('当前阈值: 0.85');
  console.log('');
  console.log('如果误杀太多（不同内容被当作重复）→ 提高阈值到 0.88-0.90');
  console.log('如果漏网太多（相似内容没被去重）→ 降低阈值到 0.80-0.82');
  console.log('');
  console.log('可通过设置环境变量调整: SEMANTIC_DEDUPE_THRESHOLD=0.85');
}

// 运行测试
runTests().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
