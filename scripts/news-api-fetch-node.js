// News API Fetch Node - Supplements RSS with keyword-based news search
// Uses News API (newsapi.org) to search for AI-related articles
// Designed to work alongside RSS feeds, not replace them
// Last updated: 2026-01-24 - Phase 2.1 News API integration

// Search query configuration
// Each query uses News API's /v2/everything endpoint
// Supports AND/OR/NOT operators
const queries = [
  {
    id: "openai-chatgpt",
    query: '"OpenAI" OR "ChatGPT" OR "GPT-5" OR "Codex"',
    description: "OpenAI products and announcements"
  },
  {
    id: "anthropic-claude",
    query: '"Anthropic" OR "Claude AI"',
    description: "Anthropic and Claude"
  },
  {
    id: "google-gemini",
    query: '"Google AI" OR "Gemini" OR "DeepMind"',
    description: "Google AI products"
  },
  {
    id: "microsoft-copilot",
    query: '"Microsoft AI" OR "Copilot" OR "Azure AI"',
    description: "Microsoft AI products"
  },
  {
    id: "ai-industry",
    query: '"AI startup" OR "AI funding" OR "AI acquisition"',
    description: "AI industry news"
  }
];

// Configuration from environment
const NEWS_API_KEY = $env.NEWS_API_KEY;
const NEWS_API_URL = 'https://newsapi.org/v2/everything';
const maxArticlesPerQuery = Number.parseInt($env.NEWS_API_MAX_PER_QUERY || '20', 10);
const timeoutMs = Number.parseInt($env.NEWS_API_TIMEOUT_MS || '15000', 10);

// Validate API key
if (!NEWS_API_KEY) {
  console.log('News API: No API key configured, skipping');
  return [];
}

// Calculate date range (last 24 hours for 2x/day schedule)
const now = new Date();
const fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
const fromDateStr = fromDate.toISOString().split('T')[0];

// Parse article date
const parseDate = (dateStr) => {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch (e) {
    return null;
  }
};

// Fetch articles for a single query
const fetchQuery = async (queryConfig) => {
  try {
    const params = new URLSearchParams({
      q: queryConfig.query,
      from: fromDateStr,
      language: 'en',
      sortBy: 'publishedAt',
      pageSize: maxArticlesPerQuery.toString(),
      apiKey: NEWS_API_KEY
    });

    const response = await this.helpers.httpRequest({
      method: 'GET',
      url: `${NEWS_API_URL}?${params.toString()}`,
      headers: {
        'User-Agent': 'n8n-news-api-fetcher/1.0'
      },
      timeout: timeoutMs,
      returnFullResponse: false
    });

    const data = typeof response === 'string' ? JSON.parse(response) : response;

    if (data.status !== 'ok') {
      throw new Error(data.message || 'API returned non-ok status');
    }

    // Transform articles to standard format
    const articles = (data.articles || []).map(article => ({
      title: (article.title || '').substring(0, 200),
      url: article.url,
      source: `News API: ${article.source?.name || 'Unknown'}`,
      sourceType: 'NewsAPI',
      tier: 'B', // News API articles are Tier B (curated search)
      snippet: (article.description || '').substring(0, 300),
      publishedAt: parseDate(article.publishedAt),
      queryId: queryConfig.id
    })).filter(a => a.title && a.url);

    return { queryId: queryConfig.id, articles, error: null };
  } catch (error) {
    return { queryId: queryConfig.id, articles: [], error: error.message };
  }
};

// Execute all queries in parallel
const allArticles = [];
const errors = [];

const fetchPromises = queries.map(q => fetchQuery(q));
const results = await Promise.all(fetchPromises);

// Collect results
results.forEach(result => {
  if (result.error) {
    errors.push({ query: result.queryId, error: result.error });
  } else {
    allArticles.push(...result.articles);
  }
});

// Deduplicate by URL (same article may appear in multiple queries)
const seenUrls = new Set();
const uniqueArticles = allArticles.filter(article => {
  if (seenUrls.has(article.url)) {
    return false;
  }
  seenUrls.add(article.url);
  return true;
});

// Log stats
const stats = {
  total_queries: queries.length,
  successful_queries: results.filter(r => !r.error).length,
  failed_queries: errors.length,
  total_articles: allArticles.length,
  unique_articles: uniqueArticles.length,
  duplicates_removed: allArticles.length - uniqueArticles.length,
  errors: errors
};
console.log('News API Fetch Stats:', JSON.stringify(stats));

// Return empty array if all queries failed
if (uniqueArticles.length === 0 && errors.length === queries.length) {
  console.log('News API: All queries failed, returning empty');
  return [];
}

return uniqueArticles.map(article => ({ json: article }));
