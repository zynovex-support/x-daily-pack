/**
 * X Daily Pack - 测试配置
 */

const path = require('path');
const fs = require('fs');

// 加载环境变量
const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  });
}

module.exports = {
  // n8n 配置
  n8n: {
    host: process.env.N8N_HOST || 'localhost',
    port: process.env.N8N_PORT || 5678,
    apiKey: process.env.N8N_API_KEY,
    workflowName: 'X Daily Pack v5'  // ID 通过 n8n-utils.getWorkflowId() 动态获取
  },

  // API Keys
  apis: {
    openai: process.env.OPENAI_API_KEY,
    newsApi: process.env.NEWS_API_KEY,
    newsData: process.env.NEWSDATA_API_KEY,
    gnews: process.env.GNEWS_API_KEY,
    theNewsApi: process.env.THENEWSAPI_KEY,
    currents: process.env.CURRENTS_API_KEY,
    mediastack: process.env.MEDIASTACK_API_KEY,
    rubeToken: process.env.RUBE_AUTH_TOKEN
  },

  // 测试超时
  timeouts: {
    http: 15000,
    workflow: 300000,
    api: 30000
  },

  // 路径
  paths: {
    root: path.join(__dirname, '../..'),
    config: path.join(__dirname, '../../config'),
    logs: path.join(__dirname, '../../logs/tests'),
    scripts: path.join(__dirname, '../../scripts'),
    workflows: path.join(__dirname, '../../workflows')
  },

  // 评分阈值
  scoring: {
    minScore: 18,
    maxScore: 30,
    dimensions: ['timeliness', 'impact', 'actionability', 'relevance'],
    categories: ['announcement', 'insight', 'tool', 'case', 'research', 'risk']
  },

  // 去重阈值
  dedupe: {
    similarityThreshold: 0.85,
    embeddingModel: 'text-embedding-3-small'
  }
};
