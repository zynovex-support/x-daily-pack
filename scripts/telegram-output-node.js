// Telegram Output Node - Sends daily pack summary to Telegram
// Parallel output alongside Slack - requires TELEGRAM_ENABLED=true

const telegramToken = $env.TELEGRAM_DAILY_BOT_TOKEN;
const chatId = $env.TELEGRAM_DAILY_CHAT_ID;
const enabled = String($env.TELEGRAM_ENABLED || '').toLowerCase() === 'true';
const strictMode = String($env.TELEGRAM_STRICT || 'true').toLowerCase() !== 'false';
const MAX_LENGTH = Number.parseInt($env.TELEGRAM_MAX_LENGTH || '4096', 10);
const RETRY_MAX = Number.parseInt($env.TELEGRAM_RETRY_MAX || '3', 10);
const RETRY_BASE_MS = Number.parseInt($env.TELEGRAM_RETRY_BASE_MS || '800', 10);

// Skip if not enabled or missing config
if (!enabled) {
  console.log('Telegram: Disabled (TELEGRAM_ENABLED != true)');
  return [{ json: { telegram: 'disabled' } }];
}

if (!telegramToken || !chatId) {
  throw new Error('Telegram: Missing TELEGRAM_DAILY_BOT_TOKEN or TELEGRAM_DAILY_CHAT_ID');
}

const data = $input.first().json;
const tweets = data.tweets || {};
const sources = data.sources || [];
const stats = data.pipeline_stats || {};

// Select top 3 highlights (prefer Tier A, high scores, tools)
const highlights = [...sources]
  .sort((a, b) => {
    // Boost GitHub/Reddit/ProductHunt sources
    const aBoost = (a.source?.includes('GitHub') || a.source?.includes('Reddit') || a.source?.includes('Product Hunt')) ? 10 : 0;
    const bBoost = (b.source?.includes('GitHub') || b.source?.includes('Reddit') || b.source?.includes('Product Hunt')) ? 10 : 0;
    // Boost Tier A
    const aTier = a.tier === 'A' ? 5 : (a.tier === 'B' ? 2 : 0);
    const bTier = b.tier === 'A' ? 5 : (b.tier === 'B' ? 2 : 0);
    const aScore = (a.score?.total || 0) + aBoost + aTier;
    const bScore = (b.score?.total || 0) + bBoost + bTier;
    return bScore - aScore;
  })
  .slice(0, 3);

// Format source tag
const getSourceTag = (source) => {
  if (source?.includes('GitHub')) return '🔧';
  if (source?.includes('Reddit')) return '💬';
  if (source?.includes('Product Hunt')) return '🚀';
  return '📰';
};

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const escapeAttr = (value) => escapeHtml(encodeURI(String(value || '')));

// Build Telegram message (HTML format)
const highlightsText = highlights.map((h, i) => {
  const tag = getSourceTag(h.source);
  const title = escapeHtml((h.title || '').substring(0, 60));
  const shortWhy = escapeHtml((h.score?.why || '').substring(0, 50));
  const link = h.url ? `<a href="${escapeAttr(h.url)}">查看链接</a>` : '查看链接';
  return `${tag} <b>${i + 1}. ${title}</b>\n   ${link}\n   <i>${shortWhy}</i>`;
}).join('\n\n');

// Pick best tweet (discovery style)
const bestTweet = tweets.hot_take?.text || tweets.framework?.text || tweets.case?.text || '';
const bestTweetText = escapeHtml(`${bestTweet.substring(0, 250)}${bestTweet.length > 250 ? '...' : ''}`);
const highlightsBlock = highlightsText || '<i>今日无重大变动</i>';

const sections = [
  `📦 <b>AI Frontline Daily</b>\n<i>${escapeHtml(new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }))}</i>`,
  '━━━━━━━━━━━━━━━━━━',
  `🔥 <b>今日亮点</b>\n\n${highlightsBlock}`,
  '━━━━━━━━━━━━━━━━━━',
  `✍️ <b>推荐推文</b>\n\n<pre>${bestTweetText}</pre>`,
  '━━━━━━━━━━━━━━━━━━',
  `📊 候选: ${stats.total_candidates || 0} | 平均分: ${stats.avg_score || 0}/30\n🔗 完整审阅请查看 Slack`
];

const stripHtml = (value) => String(value || '').replace(/<[^>]*>/g, '');

const buildMessages = (parts, maxLen) => {
  const messages = [];
  let current = '';
  parts.forEach((part) => {
    const chunk = current ? `${current}\n\n${part}` : part;
    if (chunk.length <= maxLen) {
      current = chunk;
      return;
    }
    if (current) messages.push(current);
    if (part.length <= maxLen) {
      current = part;
    } else {
      const safePart = escapeHtml(stripHtml(part));
      messages.push(safePart.slice(0, maxLen - 1) + '…');
      current = '';
    }
  });
  if (current) messages.push(current);
  return messages;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sendWithRetry = async (text, index, total) => {
  let lastError = null;
  for (let attempt = 1; attempt <= RETRY_MAX; attempt += 1) {
    try {
      const response = await this.helpers.httpRequest({
        method: 'POST',
        url: `https://api.telegram.org/bot${telegramToken}/sendMessage`,
        headers: {
          'Content-Type': 'application/json'
        },
        body: {
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: false
        },
        throwHttpErrors: false
      });

      if (response?.ok) {
        return { ok: true, response };
      }

      const code = response?.error_code || response?.statusCode || 'unknown';
      const desc = response?.description || response?.message || 'Unknown error';
      const retriable = [429, 500, 502, 503, 504].includes(Number(code));
      lastError = new Error(`Telegram API error ${code}: ${desc} (segment ${index}/${total})`);

      if (!retriable || attempt === RETRY_MAX) break;
      await sleep(RETRY_BASE_MS * attempt);
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_MAX) break;
      await sleep(RETRY_BASE_MS * attempt);
    }
  }
  return { ok: false, error: lastError };
};

try {
  const messages = buildMessages(sections, MAX_LENGTH);
  const messageIds = [];
  for (let i = 0; i < messages.length; i += 1) {
    const result = await sendWithRetry(messages[i], i + 1, messages.length);
    if (!result.ok) {
      throw result.error;
    }
    const msgId = result.response?.result?.message_id;
    if (msgId) messageIds.push(msgId);
  }

  console.log(`Telegram: Message sent successfully (${messages.length} segment(s))`);
  return [{
    json: {
      telegram: 'sent',
      message_ids: messageIds,
      chat_id: chatId,
      segments: messages.length
    }
  }];
} catch (error) {
  const message = `Telegram send failed: ${error.message}`;
  console.error(message);
  if (strictMode) {
    throw new Error(message);
  }
  return [{ json: { telegram: 'failed', error: error.message } }];
}
