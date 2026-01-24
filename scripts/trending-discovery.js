#!/usr/bin/env node
// Trending Discovery - LLM自动发现新兴关键词
// 分析最近高分内容，提取新兴话题
// 执行: node scripts/trending-discovery.js

const http = require('http');
const https = require('https');

const CONFIG_URL = process.env.CONFIG_SERVER_URL || 'http://localhost:3001';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

if (!OPENAI_API_KEY) {
  console.error('[Trending] Missing OPENAI_API_KEY');
  process.exit(1);
}

// 获取当前配置
const fetchConfig = () => new Promise((resolve, reject) => {
  http.get(`${CONFIG_URL}/config`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
  }).on('error', reject);
});

// 调用OpenAI
const callOpenAI = (prompt) => new Promise((resolve, reject) => {
  const body = JSON.stringify({
    model: OPENAI_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 200
  });

  const req = https.request({
    hostname: 'api.openai.com',
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        resolve(json.choices[0].message.content);
      } catch (e) {
        reject(e);
      }
    });
  });
  req.on('error', reject);
  req.write(body);
  req.end();
});

// 更新trending关键词
const updateTrending = (keywords) => new Promise((resolve, reject) => {
  const body = JSON.stringify({ keywords });
  const req = http.request(`${CONFIG_URL}/trending`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => resolve(JSON.parse(data)));
  });
  req.on('error', reject);
  req.write(body);
  req.end();
});

// 主流程
const main = async () => {
  console.log('[Trending] Starting discovery...');

  // 获取现有关键词
  const config = await fetchConfig();
  const existingKeywords = [];

  config.layers.core.companies.forEach(c => {
    existingKeywords.push(...c.names, ...c.products);
  });
  Object.values(config.layers.topics.categories).forEach(t => {
    existingKeywords.push(...t.keywords);
  });

  // 构建prompt (实际使用时应从n8n staticData获取最近内容)
  const prompt = `你是AI行业分析师。基于你对2026年1月AI行业的了解，识别3-5个当前热门但以下列表中没有的新兴话题或关键词。

已追踪的关键词: ${existingKeywords.slice(0, 30).join(', ')}

要求:
1. 关键词应该是具体的产品、技术或概念名称
2. 应该是最近1-2周内热度上升的话题
3. 不要重复已有关键词

返回JSON格式: {"trending": ["keyword1", "keyword2", ...]}`;

  console.log('[Trending] Calling OpenAI...');
  const response = await callOpenAI(prompt);

  // 解析响应
  const match = response.match(/\{[\s\S]*\}/);
  if (!match) {
    console.error('[Trending] Failed to parse response:', response);
    process.exit(1);
  }

  const { trending } = JSON.parse(match[0]);
  console.log('[Trending] Discovered:', trending);

  // 更新配置
  const result = await updateTrending(trending);
  console.log('[Trending] Updated:', result);
};

main().catch(err => {
  console.error('[Trending] Error:', err.message);
  process.exit(1);
});
