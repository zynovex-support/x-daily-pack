#!/usr/bin/env node
// Config Server - 提供关键词配置API
// 启动: node scripts/config-server.js
// 端口: 3001 (可通过 CONFIG_SERVER_PORT 环境变量修改)

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.CONFIG_SERVER_PORT || 3001;
const CONFIG_PATH = path.join(__dirname, '../config/keywords.json');

let configCache = null;
let configMtime = null;

// 加载配置文件（带缓存）
const loadConfig = () => {
  try {
    const stat = fs.statSync(CONFIG_PATH);
    if (!configCache || stat.mtimeMs !== configMtime) {
      configCache = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      configMtime = stat.mtimeMs;
      console.log(`[Config] Loaded config (version: ${configCache.version})`);
    }
    return configCache;
  } catch (err) {
    console.error('[Config] Failed to load config:', err.message);
    throw err;
  }
};

// 构建News API查询
const buildNewsApiQueries = (config) => {
  const queries = [];
  const maxQueries = config.meta.quotaLimits.newsApi.queriesPerRun || 6;

  // 核心公司查询 (priority 1)
  config.layers.core.companies
    .filter(c => c.priority === 1)
    .forEach(c => {
      const products = c.products.slice(0, 2).join(' OR ');
      queries.push(`${c.names[0]} OR ${products}`);
    });

  // 话题查询 (priority 1)
  Object.values(config.layers.topics.categories)
    .filter(t => t.enabled && t.priority === 1)
    .forEach(t => {
      queries.push(t.keywords.slice(0, 3).join(' OR '));
    });

  // 热点查询
  if (config.layers.trending.enabled && config.layers.trending.keywords.length > 0) {
    queries.push(config.layers.trending.keywords.slice(0, 3).join(' OR '));
  }

  return queries.slice(0, maxQueries);
};

// 构建X关键词查询
const buildXKeywordQueries = (config) => {
  const queries = [];
  const maxQueries = config.meta.quotaLimits.xSearch.queriesPerRun || 10;

  Object.entries(config.layers.topics.categories)
    .filter(([_, t]) => t.enabled)
    .sort((a, b) => a[1].priority - b[1].priority)
    .forEach(([id, topic]) => {
      queries.push({
        id,
        query: topic.xQuery,
        priority: topic.priority
      });
    });

  // 添加热点查询
  if (config.layers.trending.enabled) {
    config.layers.trending.keywords.forEach((kw, i) => {
      queries.push({
        id: `trending-${i}`,
        query: `(${kw}) -is:retweet -is:reply lang:en`,
        priority: 3
      });
    });
  }

  return queries.slice(0, maxQueries);
};

// 构建X账号查询
const buildXAccountQuery = (config) => {
  const accounts = config.layers.core.xAccounts
    .sort((a, b) => (a.tier === 'A' ? 0 : 1) - (b.tier === 'A' ? 0 : 1))
    .map(a => `from:${a.username}`)
    .join(' OR ');

  return `${accounts} -is:retweet -giveaway -airdrop`;
};

// HTTP服务器
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // 处理CORS预检
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const config = loadConfig();

    if (req.url === '/config') {
      res.end(JSON.stringify(config, null, 2));
    } else if (req.url === '/queries/news-api') {
      res.end(JSON.stringify({ queries: buildNewsApiQueries(config) }));
    } else if (req.url === '/queries/x-keywords') {
      res.end(JSON.stringify({ queries: buildXKeywordQueries(config) }));
    } else if (req.url === '/queries/x-accounts') {
      res.end(JSON.stringify({ query: buildXAccountQuery(config) }));
    } else if (req.method === 'POST' && req.url === '/trending') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { keywords } = JSON.parse(body);
          const maxKw = config.layers.trending.maxKeywords || 5;
          config.layers.trending.keywords = keywords.slice(0, maxKw);
          config.layers.trending.lastDiscovery = new Date().toISOString();
          fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
          configCache = null;
          console.log(`[Config] Updated trending keywords: ${keywords.join(', ')}`);
          res.end(JSON.stringify({ success: true, keywords: config.layers.trending.keywords }));
        } catch (err) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    } else if (req.url === '/health') {
      res.end(JSON.stringify({ status: 'ok', version: config.version }));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`[Config Server] Running on http://localhost:${PORT}`);
  console.log(`[Config Server] Endpoints:`);
  console.log(`  GET  /config          - Full configuration`);
  console.log(`  GET  /queries/news-api - News API queries`);
  console.log(`  GET  /queries/x-keywords - X keyword queries`);
  console.log(`  GET  /queries/x-accounts - X account query`);
  console.log(`  POST /trending        - Update trending keywords`);
  console.log(`  GET  /health          - Health check`);
});
