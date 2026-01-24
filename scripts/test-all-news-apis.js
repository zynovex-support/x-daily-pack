#!/usr/bin/env node
/**
 * 测试所有新闻API并评估消耗
 *
 * 测试内容：
 * 1. API连通性
 * 2. 返回数据质量
 * 3. 每次调用消耗的额度
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 加载.env
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  });
}

// API配置
const APIs = {
  newsapi: {
    name: 'News API',
    key: process.env.NEWS_API_KEY,
    dailyLimit: 100,
    testUrl: (key) => `https://newsapi.org/v2/everything?q=OpenAI&pageSize=5&apiKey=${key}`,
    parseResult: (data) => ({ count: data.totalResults, articles: data.articles?.length })
  },
  currents: {
    name: 'Currents API',
    key: process.env.CURRENTS_API_KEY,
    dailyLimit: 20,
    testUrl: (key) => `https://api.currentsapi.services/v1/search?keywords=OpenAI&apiKey=${key}`,
    parseResult: (data) => ({ count: data.news?.length || 0, articles: data.news?.length })
  },
  newsdata: {
    name: 'NewsData.io',
    key: process.env.NEWSDATA_API_KEY,
    dailyLimit: 200,
    testUrl: (key) => `https://newsdata.io/api/1/latest?apikey=${key}&q=OpenAI&language=en`,
    parseResult: (data) => ({ count: data.totalResults, articles: data.results?.length })
  },
  gnews: {
    name: 'GNews API',
    key: process.env.GNEWS_API_KEY,
    dailyLimit: 100,
    testUrl: (key) => `https://gnews.io/api/v4/search?q=OpenAI&lang=en&max=5&apikey=${key}`,
    parseResult: (data) => ({ count: data.totalArticles, articles: data.articles?.length })
  },
  thenewsapi: {
    name: 'TheNewsAPI',
    key: process.env.THENEWSAPI_KEY,
    dailyLimit: 100,
    testUrl: (key) => `https://api.thenewsapi.com/v1/news/all?api_token=${key}&search=OpenAI&language=en&limit=5`,
    parseResult: (data) => ({ count: data.meta?.found, articles: data.data?.length })
  },
  newscatcher: {
    name: 'NewsCatcher',
    key: process.env.NEWSCATCHER_API_KEY,
    dailyLimit: '2000 trial',
    testUrl: (key) => `https://api.newscatcherapi.com/v2/search?q=OpenAI&lang=en&page_size=5`,
    headers: (key) => ({ 'x-api-key': key }),
    parseResult: (data) => ({ count: data.total_hits, articles: data.articles?.length })
  },
  mediastack: {
    name: 'Mediastack',
    key: process.env.MEDIASTACK_API_KEY,
    dailyLimit: '100/month',
    // Mediastack免费版只支持HTTP
    testUrl: (key) => `http://api.mediastack.com/v1/news?access_key=${key}&keywords=OpenAI&limit=5`,
    useHttp: true,
    parseResult: (data) => ({ count: data.pagination?.total, articles: data.data?.length })
  }
};

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const client = isHttps ? https : http;
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'User-Agent': 'XDailyPack/1.0',
        ...headers
      },
      timeout: 15000
    };

    client.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, parseError: true });
        }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
  });
}

async function testAPI(id, config) {
  console.log(`\n[${ config.name }]`);
  console.log(`  Daily Limit: ${config.dailyLimit}`);

  if (!config.key) {
    console.log('  ❌ API Key not found');
    return { id, success: false, error: 'No API key' };
  }

  console.log(`  API Key: ${config.key.substring(0, 8)}...`);

  try {
    const url = config.testUrl(config.key);
    const headers = config.headers ? config.headers(config.key) : {};
    const result = await httpGet(url, headers);

    if (result.parseError) {
      console.log(`  ❌ Parse error: ${result.data.substring(0, 100)}`);
      return { id, success: false, error: 'Parse error' };
    }

    if (result.data.error || result.data.status === 'error') {
      const errMsg = result.data.error?.message || result.data.message || JSON.stringify(result.data.error);
      console.log(`  ❌ API Error: ${errMsg}`);
      return { id, success: false, error: errMsg };
    }

    const parsed = config.parseResult(result.data);
    console.log(`  ✅ Success`);
    console.log(`  📊 Total results: ${parsed.count || 'N/A'}`);
    console.log(`  📰 Articles returned: ${parsed.articles || 0}`);

    return { id, success: true, ...parsed };
  } catch (e) {
    console.log(`  ❌ Request failed: ${e.message}`);
    return { id, success: false, error: e.message };
  }
}

async function main() {
  console.log('==========================================');
  console.log('  All News APIs Test');
  console.log('==========================================');

  const results = [];

  for (const [id, config] of Object.entries(APIs)) {
    const result = await testAPI(id, config);
    results.push(result);
  }

  // 汇总
  console.log('\n==========================================');
  console.log('  Summary');
  console.log('==========================================');

  const passed = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n✅ Passed: ${passed.length}`);
  passed.forEach(r => console.log(`   - ${APIs[r.id].name}`));

  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}`);
    failed.forEach(r => console.log(`   - ${APIs[r.id].name}: ${r.error}`));
  }

  // 消耗评估
  console.log('\n==========================================');
  console.log('  Daily Quota Usage Estimate');
  console.log('==========================================');
  console.log('\n假设每天运行2次，每次5个查询：');
  console.log('每个API每天消耗: 2 × 5 = 10次\n');

  for (const [id, config] of Object.entries(APIs)) {
    const limit = config.dailyLimit;
    if (typeof limit === 'number') {
      const usage = 10;
      const remaining = limit - usage;
      const status = remaining > 0 ? '✅' : '⚠️';
      console.log(`${status} ${config.name}: ${usage}/${limit} (剩余${remaining})`);
    } else {
      console.log(`ℹ️  ${config.name}: ${limit}`);
    }
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main();
