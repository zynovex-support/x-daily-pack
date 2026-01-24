// Tweet Generation Node Code for n8n
// Humanized tweet generation - sounds like a real AI enthusiast, not a news bot

const items = $input.all();
const apiKey = $env.OPENAI_API_KEY;
const model = $env.OPENAI_MODEL || 'gpt-4o-mini';
const allowTwitterLinks = String($env.TWEET_ALLOW_TWITTER_LINKS || '').toLowerCase() === 'true';
const blocklistRaw = $env.TWEET_TONE_BLOCKLIST || 'stupid,idiot,dumb,trash,垃圾,傻,蠢,愚蠢,脑残,仇恨';
const blocklist = blocklistRaw.split(',').map(w => w.trim().toLowerCase()).filter(Boolean);

// Persona configuration for humanized tweets
const PERSONA = {
  system: `你是一个每天泡在X/GitHub/HN上的AI工具发烧友。

你的身份：
- 独立开发者，日常用AI工具提效
- 喜欢发现新工具、测试新功能
- 偶尔吐槽、偶尔惊喜、偶尔给建议

你的说话风格：
- 像跟朋友聊天，不是写新闻稿
- 会用"发现个好东西"、"试了下"、"这个思路有意思"
- 偶尔用口语词："绝了"、"真香"、"有点东西"
- 会问读者问题，邀请互动
- 分享时说"我"而不是"本文"

绝对不要：
- 像新闻播报员一样正式
- 用"值得关注"、"引发热议"这种官方腔
- 堆砌形容词
- 写成产品广告`,

  styles: [
    { id: 'discovery', name: '发现分享', desc: '分享你发现的好东西' },
    { id: 'insight', name: '个人洞察', desc: '你的看法和思考' },
    { id: 'practical', name: '实用推荐', desc: '具体怎么用、适合谁' }
  ]
};

// Collect pipeline statistics for observability
const pipelineStats = {
  total_candidates: items.length,
  by_source_type: {},
  by_tier: {},
  by_category: {},  // 新增：分类统计
  score_distribution: { high: 0, medium: 0, low: 0 },
  avg_score: 0
};

let scoreSum = 0;
items.forEach((item) => {
  const data = item.json || {};
  const sourceType = data.sourceType || 'RSS';
  const tier = data.tier || 'unknown';
  const score = data.score?.total || 0;
  const category = data.score?.category || 'unknown';

  pipelineStats.by_source_type[sourceType] = (pipelineStats.by_source_type[sourceType] || 0) + 1;
  pipelineStats.by_tier[tier] = (pipelineStats.by_tier[tier] || 0) + 1;
  pipelineStats.by_category[category] = (pipelineStats.by_category[category] || 0) + 1;

  if (score >= 24) pipelineStats.score_distribution.high++;
  else if (score >= 18) pipelineStats.score_distribution.medium++;
  else pipelineStats.score_distribution.low++;

  scoreSum += score;
});
pipelineStats.avg_score = items.length > 0 ? Math.round(scoreSum / items.length * 10) / 10 : 0;

const isTwitterUrl = (url) => {
  const text = String(url || '').toLowerCase();
  return text.includes('twitter.com/') || text.includes('x.com/') || text.includes('t.co/');
};

const eligible = items.filter((item) => {
  const data = item.json || {};
  const source = data.source || '';
  const sourceType = data.sourceType || (source.startsWith('X -') ? 'X' : 'RSS');
  const url = data.url || data.link || '';
  if (!url) return false;
  if (!allowTwitterLinks && isTwitterUrl(url)) return false;
  if (sourceType === 'X') return false;
  return true;
});

const fallbackEligible = items.filter((item) => {
  const data = item.json || {};
  const url = data.url || data.link || '';
  if (!url) return false;
  if (!allowTwitterLinks && isTwitterUrl(url)) return false;
  return true;
});

// Take top 10 items (prefer non-X sources)
const top10 = (eligible.length ? eligible : fallbackEligible).slice(0, 10);

if (!top10.length) {
  throw new Error('No eligible non-Twitter sources available for tweet generation.');
}

// Build content list - simplified, focus on what's interesting
const contentList = top10.map((item, idx) => {
  const data = item.json;
  const sourceTag = data.source?.includes('GitHub') ? '🔧 工具' :
                    data.source?.includes('Reddit') ? '💬 讨论' :
                    data.tier === 'A' ? '📢 官方' : '📰 资讯';
  return `${idx + 1}. [${sourceTag}] ${data.title}
   ${data.url}
   亮点: ${data.score?.why || data.snippet?.substring(0, 100) || ''}`;
}).join('\n\n');

const prompt = `今日AI圈这些内容比较有意思：

${contentList}

---

从中选你最想分享的1-2条，用你的风格写3个不同角度的推文。

【风格要求】
- discovery（发现型）: "发现个好东西..." / "今天试了下..." / "这个项目有点意思..."
- insight（洞察型）: 你对这事的看法，可以有态度，但不杠
- practical（实用型）: 适合谁用、怎么用、有啥坑

【硬性规则 - 必须严格遵守】
1. 每条推文**必须以URL结尾**（从上面素材中复制，不要自己编）
2. 推文文字 + URL 总长度 ≤270字符
3. 用中文写，可以夹英文术语
4. 可以问读者问题增加互动

【推文格式范例】
✅ "发现个神器：yt-dlp 视频下载工具，支持海量网站。试了下速度很快，有人用过没？https://github.com/yt-dlp/yt-dlp"
✅ "这个思路挺野的，用AI生成专业头像。看了下效果确实不错，省去找摄影师的钱了 https://example.com"
❌ "发现个好东西，yt-dlp这个视频下载工具真是功能丰富" ← **缺URL，不合格**

返回JSON（不要markdown）：
{
  "discovery": {
    "text": "推文内容【必须包含URL】",
    "source_idx": 1,
    "vibe": "惊喜/好奇/推荐"
  },
  "insight": {
    "text": "推文内容【必须包含URL】",
    "source_idx": 2,
    "vibe": "思考/吐槽/认同"
  },
  "practical": {
    "text": "推文内容【必须包含URL】",
    "source_idx": 1,
    "vibe": "实用/避坑/技巧"
  }
}`;

try {
  const response = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://api.openai.com/v1/chat/completions',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: {
      model: model,
      messages: [
        { role: 'system', content: PERSONA.system },
        { role: 'user', content: prompt }
      ],
      temperature: 0.85, // Higher for more natural variation
      response_format: { type: 'json_object' }
    }
  });

  const rawTweets = JSON.parse(response.choices[0].message.content);

  // Helper: Check if text contains a URL
  const hasUrl = (text) => {
    const urlRegex = /https?:\/\/[^\s]+/;
    return urlRegex.test(text || '');
  };

  // Helper: Ensure tweet has URL, add from source if missing
  const ensureUrl = (tweetText, sourceIdx) => {
    if (hasUrl(tweetText)) {
      return tweetText;
    }
    // Missing URL - extract from source
    const source = top10[sourceIdx - 1] || top10[0];
    const url = source?.json?.url || '';
    if (!url) {
      return tweetText; // No URL available
    }
    // Add URL at the end with a space
    return `${tweetText} ${url}`;
  };

  // Map new format to legacy format for compatibility with Slack output
  // IMPORTANT: Ensure all tweets have URLs
  const tweets = {
    hot_take: {
      text: ensureUrl(rawTweets.discovery?.text || '', rawTweets.discovery?.source_idx || 1),
      rationale: `风格: ${rawTweets.discovery?.vibe || 'discovery'}`,
      risk: '确保链接有效',
      source_idx: rawTweets.discovery?.source_idx
    },
    framework: {
      text: ensureUrl(rawTweets.insight?.text || '', rawTweets.insight?.source_idx || 2),
      rationale: `风格: ${rawTweets.insight?.vibe || 'insight'}`,
      risk: '观点表达适度',
      source_idx: rawTweets.insight?.source_idx
    },
    case: {
      text: ensureUrl(rawTweets.practical?.text || '', rawTweets.practical?.source_idx || 1),
      rationale: `风格: ${rawTweets.practical?.vibe || 'practical'}`,
      risk: '实用建议需准确',
      source_idx: rawTweets.practical?.source_idx
    }
  };

  const hasBlocked = (value) => {
    const text = String(value || '').toLowerCase();
    return blocklist.some(word => word && text.includes(word));
  };

  const buildFallback = (label, source) => {
    const title = source?.title || source?.snippet || '今日AI动态';
    const shortTitle = title.length > 60 ? title.substring(0, 60) + '...' : title;
    const url = source?.url || '';
    let text = '';
    if (label === 'hot_take') {
      text = `发现个有意思的：${shortTitle} ${url}`;
    } else if (label === 'framework') {
      text = `这个思路可以参考下：${shortTitle} ${url}`;
    } else {
      text = `分享个实用的：${shortTitle}，感兴趣可以看看 ${url}`;
    }
    return {
      text,
      rationale: '使用简化的人性化模板',
      risk: '内容较简单',
      tone_guarded: true
    };
  };

  const applyToneGuard = (tweetObj, label, fallbackSource) => {
    if (!tweetObj || !tweetObj.text) return buildFallback(label, fallbackSource);
    const blocked = [tweetObj.text, tweetObj.rationale, tweetObj.risk].some(hasBlocked);
    if (blocked) return buildFallback(label, fallbackSource);
    return tweetObj;
  };

  const fallbackSources = [top10[0]?.json, top10[1]?.json, top10[2]?.json];

  // Validate and truncate tweets to ensure 280 character limit
  const MAX_LENGTH = 280;
  const validateAndTruncate = (tweetObj) => {
    if (!tweetObj || !tweetObj.text) return tweetObj;

    const text = tweetObj.text;
    const length = text.length;

    if (length <= MAX_LENGTH) {
      return { ...tweetObj, length, truncated: false };
    }

    // Extract URLs to preserve them
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = text.match(urlRegex) || [];

    // Calculate available space for text (280 - URLs - ellipsis - spaces)
    const urlsLength = urls.reduce((sum, url) => sum + url.length, 0);
    const availableSpace = MAX_LENGTH - urlsLength - 3; // 3 for "..."

    if (availableSpace < 50) {
      // If not enough space, just hard truncate
      return {
        ...tweetObj,
        text: text.substring(0, MAX_LENGTH - 3) + '...',
        length: MAX_LENGTH,
        truncated: true,
        original_length: length
      };
    }

    // Smart truncate: remove text but keep URLs
    let textWithoutUrls = text;
    urls.forEach(url => {
      textWithoutUrls = textWithoutUrls.replace(url, '');
    });

    const truncatedText = textWithoutUrls.substring(0, availableSpace).trim();
    const finalText = truncatedText + '... ' + urls.join(' ');

    return {
      ...tweetObj,
      text: finalText,
      length: finalText.length,
      truncated: true,
      original_length: length
    };
  };

  // Validate all three tweet types
  const validatedTweets = {
    hot_take: validateAndTruncate(applyToneGuard(tweets.hot_take, 'hot_take', fallbackSources[0])),
    framework: validateAndTruncate(applyToneGuard(tweets.framework, 'framework', fallbackSources[1])),
    case: validateAndTruncate(applyToneGuard(tweets.case, 'case', fallbackSources[2]))
  };

  // Log pipeline stats for debugging
  console.log('Pipeline Stats:', JSON.stringify(pipelineStats));

  return [{
    json: {
      tweets: validatedTweets,
      sources: top10.map(item => item.json),
      generated_at: new Date().toISOString(),
      pipeline_stats: pipelineStats
    }
  }];
} catch (error) {
  throw new Error(`Tweet generation failed: ${error.message}`);
}
