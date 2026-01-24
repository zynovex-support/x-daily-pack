// Telegram Output Node - Sends daily pack summary to Telegram
// Parallel output alongside Slack - requires TELEGRAM_ENABLED=true

const telegramToken = $env.TELEGRAM_BOT_TOKEN;
const chatId = $env.TELEGRAM_CHAT_ID;
const enabled = String($env.TELEGRAM_ENABLED || '').toLowerCase() === 'true';
const strictMode = String($env.TELEGRAM_STRICT || 'true').toLowerCase() !== 'false';

// Skip if not enabled or missing config
if (!enabled) {
  console.log('Telegram: Disabled (TELEGRAM_ENABLED != true)');
  return [{ json: { telegram: 'disabled' } }];
}

if (!telegramToken || !chatId) {
  throw new Error('Telegram: Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
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

const message = `📦 <b>AI Frontline Daily</b>
<i>${escapeHtml(new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }))}</i>

━━━━━━━━━━━━━━━━━━

🔥 <b>今日亮点</b>

${highlightsBlock}

━━━━━━━━━━━━━━━━━━

✍️ <b>推荐推文</b>

<pre>${bestTweetText}</pre>

━━━━━━━━━━━━━━━━━━

📊 候选: ${stats.total_candidates || 0} | 平均分: ${stats.avg_score || 0}/30
🔗 完整审阅请查看 Slack`;

try {
  const response = await this.helpers.httpRequest({
    method: 'POST',
    url: `https://api.telegram.org/bot${telegramToken}/sendMessage`,
    headers: {
      'Content-Type': 'application/json'
    },
    body: {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: false
    },
    throwHttpErrors: false
  });

  if (!response?.ok) {
    const code = response?.error_code || response?.statusCode || 'unknown';
    const desc = response?.description || response?.message || 'Unknown error';
    throw new Error(`Telegram API error ${code}: ${desc}`);
  }

  console.log('Telegram: Message sent successfully');
  return [{
    json: {
      telegram: 'sent',
      message_id: response.result?.message_id,
      chat_id: chatId
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
