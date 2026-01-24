// RSS Fetch Node - Dynamically fetches all configured feeds
// This replaces multiple hardcoded RSS nodes with a single dynamic fetcher
// Uses n8n's httpRequest helper instead of Node.js http/https modules

// RSS feed configuration (embedded from config/rss-feeds.json)
// To update: copy feeds array from config/rss-feeds.json
// Last updated: 2026-01-24 - 33 sources (Phase 2.4 expansion)
const feeds = [
  // Tier A - Official sources (12)
  { id: "openai-news", name: "OpenAI News", url: "https://openai.com/news/rss.xml", tier: "A" },
  { id: "deepmind-blog", name: "DeepMind Blog", url: "https://deepmind.google/blog/rss.xml", tier: "A" },
  { id: "google-ai-blog", name: "Google AI Blog", url: "https://blog.google/technology/ai/rss/", tier: "A" },
  { id: "langchain-blog", name: "LangChain Blog", url: "https://blog.langchain.dev/rss/", tier: "A" },
  { id: "huggingface-blog", name: "Hugging Face Blog", url: "https://huggingface.co/blog/feed.xml", tier: "A" },
  { id: "microsoft-ai", name: "Microsoft AI Blog", url: "https://blogs.microsoft.com/ai/feed/", tier: "A" },
  { id: "aws-ml", name: "AWS Machine Learning Blog", url: "https://aws.amazon.com/blogs/machine-learning/feed/", tier: "A" },
  { id: "nvidia-developer", name: "Nvidia Developer Blog", url: "https://developer.nvidia.com/blog/feed", tier: "A" },
  { id: "nvidia-news", name: "Nvidia Newsroom", url: "https://nvidianews.nvidia.com/rss.xml", tier: "A" },
  { id: "meta-engineering", name: "Meta Engineering", url: "https://engineering.fb.com/feed/", tier: "A" },
  { id: "wandb", name: "Weights & Biases Blog", url: "https://wandb.ai/fully-connected/rss.xml", tier: "A" },
  { id: "import-ai", name: "Import AI (Jack Clark)", url: "https://importai.substack.com/feed", tier: "A" },
  { id: "anthropic-news", name: "Anthropic News", url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic.xml", tier: "A" },
  // Tier B - Expert blogs + Media + Reddit + Research (16)
  { id: "simonwillison", name: "Simon Willison", url: "https://simonwillison.net/atom/everything/", tier: "B" },
  { id: "latent-space", name: "Latent Space", url: "https://www.latent.space/feed", tier: "B" },
  { id: "interconnects", name: "Interconnects", url: "https://www.interconnects.ai/feed", tier: "B" },
  { id: "lilian-weng", name: "Lil'Log (Lilian Weng)", url: "https://lilianweng.github.io/index.xml", tier: "B" },
  { id: "reddit-localllama", name: "Reddit - LocalLLaMA", url: "https://www.reddit.com/r/LocalLLaMA/.rss", tier: "B" },
  { id: "reddit-machinelearning", name: "Reddit - MachineLearning", url: "https://www.reddit.com/r/MachineLearning/.rss", tier: "B" },
  { id: "producthunt-ai", name: "Product Hunt - AI", url: "https://www.producthunt.com/feed?category=artificial-intelligence", tier: "B" },
  { id: "techcrunch-ai", name: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/", tier: "B" },
  { id: "venturebeat-ai", name: "VentureBeat AI", url: "https://venturebeat.com/category/ai/feed/", tier: "B" },
  { id: "mit-tech-review", name: "MIT Technology Review", url: "https://www.technologyreview.com/feed/", tier: "B" },
  { id: "theverge-ai", name: "The Verge AI", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", tier: "B" },
  { id: "wired-ai", name: "Wired AI", url: "https://www.wired.com/feed/tag/ai/latest/rss", tier: "B" },
  { id: "infoq-ai", name: "InfoQ AI/ML", url: "https://feed.infoq.com/ai-ml-data-eng/", tier: "B" },
  { id: "arxiv-ai", name: "ArXiv AI", url: "https://rss.arxiv.org/rss/cs.AI", tier: "B" },
  { id: "36kr", name: "36Kr", url: "https://36kr.com/feed", tier: "B" },
  // Tier C - Community + Tools
  { id: "github-trending-python", name: "GitHub Trending - Python", url: "https://mshibanami.github.io/GitHubTrendingRSS/daily/python.xml", tier: "C" },
  { id: "github-trending-all", name: "GitHub Trending - All", url: "https://mshibanami.github.io/GitHubTrendingRSS/daily/all.xml", tier: "C" },
  { id: "reddit-chatgpt", name: "Reddit - ChatGPT", url: "https://www.reddit.com/r/ChatGPT/.rss", tier: "C" },
  { id: "hackernews-best", name: "Hacker News - Best", url: "https://hnrss.org/best?count=20", tier: "C" },
  { id: "hackernews-ai", name: "Hacker News - AI", url: "https://hnrss.org/newest?q=AI+OR+GPT+OR+LLM&count=15", tier: "C" },
  // Tier D - Aggregators
  { id: "google-news-ai", name: "Google News - AI", url: "https://news.google.com/rss/search?q=artificial+intelligence+OR+AI&hl=en-US&gl=US&ceid=US:en", tier: "D" }
];

const maxItemsPerFeed = Number.parseInt($env.RSS_MAX_ITEMS_PER_FEED || '15', 10);
const timeoutMs = Number.parseInt($env.RSS_FETCH_TIMEOUT_MS || '15000', 10);
const maxRetries = Number.parseInt($env.RSS_RETRY_MAX_ATTEMPTS || '3', 10);
const retryDelayMs = Number.parseInt($env.RSS_RETRY_INITIAL_DELAY_MS || '500', 10);

// Exponential backoff retry function
const retryWithBackoff = async (fn, maxAttempts = maxRetries, initialDelayMs = retryDelayMs) => {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isRetryable = /timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|429|503|502/i.test(error.message);
      if (!isRetryable || attempt === maxAttempts) throw error;
      const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
      console.log(`[RSS Retry] Attempt ${attempt}/${maxAttempts} failed, retrying in ${delayMs}ms`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastError;
};

const parseRssDate = (dateStr) => {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch (e) {
    return null;
  }
};

const extractText = (xml, tag) => {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = xml.match(regex);
  if (!match) return '';
  let text = match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return text.trim();
};

const extractLink = (itemXml) => {
  const hrefMatch = itemXml.match(/<link[^>]+href=["']([^"']+)["']/i);
  if (hrefMatch) return hrefMatch[1];
  return extractText(itemXml, 'link');
};

const parseItems = (xml, feedName, tier) => {
  const items = [];
  const itemRegex = /<(item|entry)[\s>]([\s\S]*?)<\/\1>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null && items.length < maxItemsPerFeed) {
    const itemXml = match[2];
    const title = extractText(itemXml, 'title');
    const link = extractLink(itemXml);
    const description = extractText(itemXml, 'description') || extractText(itemXml, 'summary') || extractText(itemXml, 'content');
    const pubDate = extractText(itemXml, 'pubDate') || extractText(itemXml, 'published') || extractText(itemXml, 'updated');

    if (title && link) {
      items.push({
        title: title.substring(0, 200),
        url: link,
        source: feedName,
        sourceType: 'RSS',
        tier: tier,
        snippet: description.substring(0, 300),
        publishedAt: parseRssDate(pubDate)
      });
    }
  }

  return items;
};

const allItems = [];
const errors = [];

const fetchPromises = feeds.map(async (feed) => {
  try {
    const response = await retryWithBackoff(async () => {
      return await this.helpers.httpRequest({
        method: 'GET',
        url: feed.url,
        headers: {
          'User-Agent': 'n8n-rss-fetcher/1.0',
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml'
        },
        timeout: timeoutMs,
        returnFullResponse: false
      });
    });

    const xml = typeof response === 'string' ? response : JSON.stringify(response);
    const items = parseItems(xml, feed.name, feed.tier);
    return { feed: feed.id, items, error: null, retried: false };
  } catch (error) {
    return { feed: feed.id, items: [], error: error.message, retried: true };
  }
});

const results = await Promise.all(fetchPromises);

results.forEach(result => {
  if (result.error) {
    errors.push({ feed: result.feed, error: result.error });
  } else {
    allItems.push(...result.items);
  }
});

const stats = {
  total_feeds: feeds.length,
  successful_feeds: results.filter(r => !r.error).length,
  failed_feeds: errors.length,
  total_items: allItems.length,
  errors: errors
};
console.log('RSS Fetch Stats:', JSON.stringify(stats));

if (allItems.length === 0 && errors.length === feeds.length) {
  throw new Error(`All RSS feeds failed: ${JSON.stringify(errors)}`);
}

return allItems.map(item => ({ json: item }));
