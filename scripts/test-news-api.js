#!/usr/bin/env node
/**
 * News API Integration Test
 * Tests the News API fetch functionality before n8n integration
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env manually (no dotenv dependency)
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim();
    }
  });
}

const NEWS_API_KEY = process.env.NEWS_API_KEY;
const NEWS_API_URL = 'https://newsapi.org/v2/everything';

// Test queries (same as news-api-fetch-node.js)
const queries = [
  { id: "openai-chatgpt", query: '"OpenAI" OR "ChatGPT"' },
  { id: "anthropic-claude", query: '"Anthropic" OR "Claude AI"' },
  { id: "google-gemini", query: '"Google AI" OR "Gemini"' }
];

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'User-Agent': 'XDailyPack/1.0 (news aggregator)'
      }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    }).on('error', reject);
  });
}

async function testQuery(queryConfig) {
  const now = new Date();
  const fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const fromDateStr = fromDate.toISOString().split('T')[0];

  const params = new URLSearchParams({
    q: queryConfig.query,
    from: fromDateStr,
    language: 'en',
    sortBy: 'publishedAt',
    pageSize: '5',
    apiKey: NEWS_API_KEY
  });

  const url = `${NEWS_API_URL}?${params.toString()}`;

  console.log(`\n[${queryConfig.id}] Testing: ${queryConfig.query}`);

  try {
    const result = await httpGet(url);

    if (result.data.status === 'ok') {
      console.log(`  ✅ Status: ok`);
      console.log(`  📊 Total results: ${result.data.totalResults}`);
      console.log(`  📰 Articles returned: ${result.data.articles?.length || 0}`);

      if (result.data.articles?.length > 0) {
        console.log(`  📝 Sample articles:`);
        result.data.articles.slice(0, 3).forEach((a, i) => {
          console.log(`     ${i+1}. ${a.title?.substring(0, 60)}...`);
          console.log(`        Source: ${a.source?.name}, Date: ${a.publishedAt?.split('T')[0]}`);
        });
      }
      return { success: true, count: result.data.totalResults };
    } else {
      console.log(`  ❌ Error: ${result.data.message}`);
      return { success: false, error: result.data.message };
    }
  } catch (e) {
    console.log(`  ❌ Request failed: ${e.message}`);
    return { success: false, error: e.message };
  }
}

async function main() {
  console.log('========================================');
  console.log('  News API Integration Test');
  console.log('========================================');

  if (!NEWS_API_KEY) {
    console.log('\n❌ NEWS_API_KEY not found in .env');
    process.exit(1);
  }

  console.log(`\n✅ API Key found: ${NEWS_API_KEY.substring(0, 8)}...`);

  let passed = 0;
  let failed = 0;

  for (const q of queries) {
    const result = await testQuery(q);
    if (result.success) passed++;
    else failed++;
  }

  console.log('\n========================================');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('========================================');

  process.exit(failed > 0 ? 1 : 0);
}

main();
