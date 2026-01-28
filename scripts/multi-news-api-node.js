// Multi News API Fetch Node
// 统一采集多个新闻API，合并去重后输出
// 所有API key从环境变量读取，不写死到代码中

// API配置 - 从环境变量读取key
const APIs = {
  newsapi: {
    name: 'News API',
    enabled: !!$env.NEWS_API_KEY,
    key: $env.NEWS_API_KEY,
    dailyLimit: 100,
    baseUrl: 'https://newsapi.org/v2/everything',
    buildUrl: (key, query) =>
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=10&apiKey=${key}`,
    headers: () => ({ 'User-Agent': 'XDailyPack/1.0' }),
    parseResponse: (data) => (data.articles || []).map(a => ({
      title: a.title,
      url: a.url,
      source: `NewsAPI: ${a.source?.name || 'Unknown'}`,
      snippet: a.description || '',
      publishedAt: a.publishedAt
    }))
  },

  newsdata: {
    name: 'NewsData.io',
    enabled: !!$env.NEWSDATA_API_KEY,
    key: $env.NEWSDATA_API_KEY,
    dailyLimit: 200,
    buildUrl: (key, query) =>
      `https://newsdata.io/api/1/latest?apikey=${key}&q=${encodeURIComponent(query)}&language=en`,
    headers: () => ({ 'User-Agent': 'XDailyPack/1.0' }),
    parseResponse: (data) => (data.results || []).map(a => ({
      title: a.title,
      url: a.link,
      source: `NewsData: ${a.source_id || 'Unknown'}`,
      snippet: a.description || '',
      publishedAt: a.pubDate
    }))
  },

  gnews: {
    name: 'GNews API',
    enabled: !!$env.GNEWS_API_KEY,
    key: $env.GNEWS_API_KEY,
    dailyLimit: 100,
    buildUrl: (key, query) =>
      `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&max=10&apikey=${key}`,
    headers: () => ({ 'User-Agent': 'XDailyPack/1.0' }),
    parseResponse: (data) => (data.articles || []).map(a => ({
      title: a.title,
      url: a.url,
      source: `GNews: ${a.source?.name || 'Unknown'}`,
      snippet: a.description || '',
      publishedAt: a.publishedAt
    }))
  },

  thenewsapi: {
    name: 'TheNewsAPI',
    enabled: !!$env.THENEWSAPI_KEY,
    key: $env.THENEWSAPI_KEY,
    dailyLimit: 100,
    buildUrl: (key, query) =>
      `https://api.thenewsapi.com/v1/news/all?api_token=${key}&search=${encodeURIComponent(query)}&language=en&limit=10`,
    headers: () => ({ 'User-Agent': 'XDailyPack/1.0' }),
    parseResponse: (data) => (data.data || []).map(a => ({
      title: a.title,
      url: a.url,
      source: `TheNewsAPI: ${a.source || 'Unknown'}`,
      snippet: a.description || a.snippet || '',
      publishedAt: a.published_at
    }))
  },

  currents: {
    name: 'Currents API',
    enabled: !!$env.CURRENTS_API_KEY,
    key: $env.CURRENTS_API_KEY,
    dailyLimit: 1000,
    buildUrl: (key, query) =>
      `https://api.currentsapi.services/v1/search?apiKey=${key}&keywords=${encodeURIComponent(query)}&language=en`,
    headers: () => ({ 'User-Agent': 'XDailyPack/1.0' }),
    parseResponse: (data) => (data.news || []).map(a => ({
      title: a.title,
      url: a.url,
      source: `Currents: ${a.author || 'Unknown'}`,
      snippet: a.description || '',
      publishedAt: a.published
    }))
  }
};

// 已知媒体源tier映射
const sourceTierMap = {
  // Tier A - 官方源 (通常不会出现在News API中，但保留以防)
  'openai': 'A',
  'anthropic': 'A',
  'google ai': 'A',
  'deepmind': 'A',

  // Tier B - 权威媒体
  'techcrunch': 'B',
  'venturebeat': 'B',
  'wired': 'B',
  'the verge': 'B',
  'mit technology review': 'B',
  'reuters': 'B',
  'bloomberg': 'B',
  'cnbc': 'B',
  'bbc': 'B',
  'cnn': 'B',
  'ars technica': 'B',
  'engadget': 'B',
  'zdnet': 'B',
  'the information': 'B',
  'financial times': 'B',
  'wall street journal': 'B',
  'new york times': 'B',
  'washington post': 'B',

  // Tier C - 社区/二手源
  'reddit': 'C',
  'medium': 'C',
  'dev.to': 'C',
  'hacker news': 'C',
  'slashdot': 'C',
  'digg': 'C',

  // Tier D - 聚合源
  'google news': 'D',
  'yahoo news': 'D',
  'msn': 'D',
  'flipboard': 'D'
};

// 根据source名称分配tier
const assignTier = (sourceName) => {
  const lower = (sourceName || '').toLowerCase();
  for (const [name, tier] of Object.entries(sourceTierMap)) {
    if (lower.includes(name)) return tier;
  }
  return 'B'; // 默认Tier B（权威媒体级别）
};

// 默认关键词 (fallback)
const DEFAULT_QUERIES = [
  'OpenAI OR GPT-5 OR ChatGPT',
  'Anthropic OR Claude OR "Claude Opus"',
  'Google Gemini OR "Gemini 3" OR DeepMind',
  'DeepSeek OR "DeepSeek V3" OR "DeepSeek V4"',
  'AI agent OR MCP OR "Tool Use"',
  'xAI OR Grok OR Perplexity'
];

// 从配置服务器获取查询（带 API Key 认证）
const CONFIG_URL = $env.CONFIG_SERVER_URL || 'http://localhost:3001';
const CONFIG_API_KEY = $env.CONFIG_API_KEY;
const configHeaders = CONFIG_API_KEY ? { 'X-API-Key': CONFIG_API_KEY } : undefined;
let queries = DEFAULT_QUERIES;

try {
  const configResp = await this.helpers.httpRequest({
    method: 'GET',
    url: `${CONFIG_URL}/queries/news-api`,
    headers: configHeaders,
    timeout: 5000
  });
  const data = typeof configResp === 'string' ? JSON.parse(configResp) : configResp;
  if (data.queries && data.queries.length > 0) {
    queries = data.queries;
    console.log(`[NewsAPI] Loaded ${queries.length} queries from config server`);
  }
} catch (err) {
  console.log(`[NewsAPI] Config fetch failed (${err.message}), using defaults`);
}

// 每个API只执行一个查询，轮流分配以节省额度
const getQueryForApi = (apiIndex) => queries[apiIndex % queries.length];

// 重试与超时配置（缩短单节点最坏耗时，降低 runner 排队超时风险）
const maxRetries = Number.parseInt($env.NEWS_API_RETRY_MAX_ATTEMPTS || '2', 10);
const retryDelayMs = Number.parseInt($env.NEWS_API_RETRY_INITIAL_DELAY_MS || '400', 10);
const requestTimeoutMs = Number.parseInt($env.NEWS_API_REQUEST_TIMEOUT_MS || '10000', 10);

// Exponential backoff retry function
const retryWithBackoff = async (fn, maxAttempts = maxRetries, initialDelayMs = retryDelayMs) => {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isRetryable = /timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|429|503|502|rate limit/i.test(error.message);
      if (!isRetryable || attempt === maxAttempts) throw error;
      const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
      console.log(`[NewsAPI Retry] Attempt ${attempt}/${maxAttempts} failed, retrying in ${delayMs}ms`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastError;
};

const allArticles = [];
const errors = [];
const stats = { apis: {} };

// 获取启用的API列表
const enabledApis = Object.entries(APIs).filter(([_, cfg]) => cfg.enabled);

if (enabledApis.length === 0) {
  console.log('No News APIs configured');
  return [];
}

// 强降级护栏：限制单次运行的 API 数量与总预算时间（默认尽量不改变行为）
const maxApisPerRunRaw = Number.parseInt($env.NEWS_API_MAX_APIS_PER_RUN || String(enabledApis.length), 10);
const maxApisPerRun = Number.isFinite(maxApisPerRunRaw)
  ? Math.max(1, Math.min(enabledApis.length, maxApisPerRunRaw))
  : enabledApis.length;
const apisToRun = enabledApis.slice(0, maxApisPerRun);
if (apisToRun.length < enabledApis.length) {
  console.log(`[NewsAPI] Limiting APIs per run: ${apisToRun.length}/${enabledApis.length}`);
}

const overallBudgetMsRaw = Number.parseInt($env.NEWS_API_OVERALL_BUDGET_MS || '25000', 10);
const overallBudgetMs = Number.isFinite(overallBudgetMsRaw) ? Math.max(5000, overallBudgetMsRaw) : 25000;
const budgetDeadline = Date.now() + overallBudgetMs;
const remainingBudgetMs = () => Math.max(0, budgetDeadline - Date.now());

// 并行请求所有API
const fetchPromises = apisToRun.map(async ([id, config], index) => {
  const query = getQueryForApi(index);
  const url = config.buildUrl(config.key, query);

  try {
    const remainingAtStart = remainingBudgetMs();
    if (remainingAtStart < 1500) {
      const message = `budget exhausted before request (${remainingAtStart}ms left)`;
      stats.apis[id] = { success: false, error: message, query, budget_ms_left: remainingAtStart };
      return { id, articles: [], error: message };
    }

    const perApiTimeoutMs = Math.min(
      requestTimeoutMs,
      Math.max(1000, remainingAtStart - 400),
    );

    const response = await retryWithBackoff(async () => {
      return await this.helpers.httpRequest({
        method: 'GET',
        url: url,
        headers: config.headers(),
        timeout: perApiTimeoutMs,
        returnFullResponse: false
      });
    });

    const data = typeof response === 'string' ? JSON.parse(response) : response;

    if (data.error || data.status === 'error') {
      throw new Error(data.error?.message || data.message || 'API error');
    }

    const articles = config.parseResponse(data);
    stats.apis[id] = {
      success: true,
      count: articles.length,
      query,
      timeout_ms: perApiTimeoutMs,
      budget_ms_left: remainingBudgetMs(),
    };
    return { id, articles, error: null };
  } catch (error) {
    stats.apis[id] = {
      success: false,
      error: error.message,
      query,
      budget_ms_left: remainingBudgetMs(),
    };
    return { id, articles: [], error: error.message };
  }
});

// allSettled 避免单个 promise 异常导致整批失败
const settledResults = await Promise.allSettled(fetchPromises);
const results = settledResults.map((result, index) => {
  if (result.status === 'fulfilled') return result.value;
  const [id] = apisToRun[index];
  const message = result.reason?.message || String(result.reason || 'unknown error');
  stats.apis[id] = { success: false, error: message };
  return { id, articles: [], error: message };
});

// 收集结果
results.forEach(result => {
  if (result.error) {
    errors.push({ api: result.id, error: result.error });
  } else {
    result.articles.forEach(article => {
      article.sourceType = 'NewsAPI';
      article.tier = assignTier(article.source);
      article.apiSource = result.id;
    });
    allArticles.push(...result.articles);
  }
});

// URL去重
const seenUrls = new Set();
const uniqueArticles = allArticles.filter(article => {
  if (!article.url || seenUrls.has(article.url)) return false;
  seenUrls.add(article.url);
  return true;
});

// 日志统计
stats.total_apis_enabled = enabledApis.length;
stats.total_apis = apisToRun.length;
stats.successful_apis = results.filter(r => !r.error).length;
stats.total_articles = allArticles.length;
stats.unique_articles = uniqueArticles.length;
stats.errors = errors;
stats.overall_budget_ms = overallBudgetMs;
stats.budget_ms_left = remainingBudgetMs();

console.log('Multi News API Stats:', JSON.stringify(stats));

return uniqueArticles.map(article => ({ json: article }));
