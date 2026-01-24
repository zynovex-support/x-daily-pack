// Slack Block Kit Output Node Code for n8n
// This code formats and sends the daily pack to Slack

const data = $input.first().json;
const slackToken = $env.SLACK_BOT_TOKEN;
const channelId = $env.SLACK_CHANNEL_ID;
const xWriteEnabled = String($env.X_WRITE_ENABLED || '').toLowerCase() === 'true';

// 分类配置
const groupByCategory = ($env.SLACK_GROUP_BY_CATEGORY || 'true') === 'true';
const includeCategoriesRaw = $env.SLACK_INCLUDE_CATEGORIES || '';
const excludeCategoriesRaw = $env.SLACK_EXCLUDE_CATEGORIES || '';

const includeCategories = includeCategoriesRaw
  ? includeCategoriesRaw.split(',').map(c => c.trim().toLowerCase()).filter(Boolean)
  : null;
const excludeCategories = excludeCategoriesRaw
  ? excludeCategoriesRaw.split(',').map(c => c.trim().toLowerCase()).filter(Boolean)
  : [];

const categoryOrder = ['announcement', 'tool', 'insight', 'case', 'research', 'risk', 'unknown'];
const categoryLabels = {
  'announcement': '📢 公告/发布',
  'tool': '🛠️ 工具/产品',
  'insight': '💡 洞察/观点',
  'case': '📊 案例/应用',
  'research': '🔬 研究/论文',
  'risk': '⚠️ 风险/警示',
  'unknown': '📄 其他'
};

// 事件聚类视图配置
const eventViewEnabled = ($env.SLACK_EVENT_VIEW_ENABLED || 'true') === 'true';
const showClusterSummary = ($env.SLACK_SHOW_CLUSTER_SUMMARY || 'true') === 'true';

const tweets = data.tweets;
const sources = data.sources;
const modeLine = xWriteEnabled
  ? '🟢 实发模式：已开启 X 写入（X_WRITE_ENABLED=true）'
  : '🔴 DRY-RUN：未开启 X 写入（X_WRITE_ENABLED=false）';
const modeNote = xWriteEnabled
  ? '（将真实发布到 X）'
  : '（默认仅 dry-run，不会真的发推；需要你在环境变量开启 X 写入开关）';
const instructions = [
  '在本消息线程回复以下指令以执行动作：',
  '`post 1` 发布 Option 1',
  '`post 2` 发布 Option 2',
  '`post 3` 发布 Option 3',
  modeLine,
  modeNote,
].join('\n');

// Extract Top 3 highlights from sources
// Priority: Tier A sources, high scores, keywords indicating major changes
const highlightKeywords = [
  'release', 'launch', 'announce', 'new', 'update', 'v2', 'v3', 'v4',
  'gpt-5', 'claude', 'gemini', 'llama', 'mistral', 'api', 'sdk',
  '发布', '更新', '升级', '新版', '重大', '突破'
];

const getHighlightScore = (source) => {
  let score = source.score?.total || 0;
  // Boost Tier A sources significantly
  if (source.tier === 'A') score += 15;
  else if (source.tier === 'B') score += 5;
  // Boost items with highlight keywords
  const titleLower = (source.title || '').toLowerCase();
  const snippetLower = (source.snippet || '').toLowerCase();
  for (const kw of highlightKeywords) {
    if (titleLower.includes(kw) || snippetLower.includes(kw)) {
      score += 3;
      break;
    }
  }
  return score;
};

const topHighlights = [...sources]
  .map(s => ({ ...s, highlightScore: getHighlightScore(s) }))
  .sort((a, b) => b.highlightScore - a.highlightScore)
  .slice(0, 3);

// Format highlight text with emoji based on tier
const formatHighlight = (item, idx) => {
  const tierEmoji = item.tier === 'A' ? '🔴' : item.tier === 'B' ? '🟠' : '🟡';
  const title = (item.title || '').substring(0, 60);
  const source = item.source || 'Unknown';
  return `${tierEmoji} *${idx + 1}. ${title}*\n   _来源: ${source}_`;
};

// 格式化事件聚类视图
const formatEventCluster = (cluster, articles) => {
  const tierEmoji = (tier) => tier === 'A' ? '🔴' : tier === 'B' ? '🟠' : '🟡';
  const tierLabel = (tier) => tier === 'A' ? '官方源' : tier === 'B' ? '媒体源' : '社区源';

  const lines = [];
  lines.push(`━━━━━━━━━━━━━━━━`);
  lines.push(`📰 *事件: ${cluster.label}* (${cluster.articleCount}篇报道)`);
  lines.push(`━━━━━━━━━━━━━━━━`);

  articles.forEach(article => {
    const emoji = tierEmoji(article.tier);
    const label = tierLabel(article.tier);
    const score = article.score?.total || article.score || 0;
    lines.push(`${emoji} ${label} | ${article.source}`);
    lines.push(`   ${article.title} | ${score}/30`);
  });

  if (showClusterSummary && cluster.articleCount > 1) {
    const sources = [...new Set(articles.map(a => a.source))].slice(0, 3).join('+');
    lines.push(`📊 _综合: ${sources}_`);
  }

  return lines.join('\n');
};

const highlightsText = topHighlights.length > 0
  ? topHighlights.map((h, i) => formatHighlight(h, i)).join('\n\n')
  : '_今日无重大变动_';

// Build Slack Block Kit message
const blocks = [
  {
    "type": "header",
    "text": {
      "type": "plain_text",
      "text": "📦 Today's X Daily Pack",
      "emoji": true
    }
  },
  {
    "type": "context",
    "elements": [
      {
        "type": "mrkdwn",
        "text": `Generated: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`
      }
    ]
  },
  {
    "type": "divider"
  },
  {
    "type": "section",
    "text": {
      "type": "mrkdwn",
      "text": `*🔥 Top 3 重大变动*\n\n${highlightsText}`
    }
  },
  {
    "type": "divider"
  },
  {
    "type": "section",
    "text": {
      "type": "mrkdwn",
      "text": `*✅ 审核与发布*\n${instructions}`
    }
  },
  {
    "type": "divider"
  },
  {
    "type": "section",
    "text": {
      "type": "mrkdwn",
      "text": "*🎯 推文选项（选一个发布）*"
    }
  },
  {
    "type": "section",
    "text": {
      "type": "mrkdwn",
      "text": `*Option 1: Hot Take* ${tweets.hot_take.truncated ? '⚠️ _已截断_' : ''}\n${tweets.hot_take.text}\n\n_字符数: ${tweets.hot_take.length || tweets.hot_take.text.length}/280_${tweets.hot_take.truncated ? ` | _原始: ${tweets.hot_take.original_length}_` : ''}\n_理由: ${tweets.hot_take.rationale}_\n_风险: ${tweets.hot_take.risk}_`
    }
  },
  {
    "type": "divider"
  },
  {
    "type": "section",
    "text": {
      "type": "mrkdwn",
      "text": `*Option 2: Framework* ${tweets.framework.truncated ? '⚠️ _已截断_' : ''}\n${tweets.framework.text}\n\n_字符数: ${tweets.framework.length || tweets.framework.text.length}/280_${tweets.framework.truncated ? ` | _原始: ${tweets.framework.original_length}_` : ''}\n_理由: ${tweets.framework.rationale}_\n_风险: ${tweets.framework.risk}_`
    }
  },
  {
    "type": "divider"
  },
  {
    "type": "section",
    "text": {
      "type": "mrkdwn",
      "text": `*Option 3: Case Study* ${tweets.case.truncated ? '⚠️ _已截断_' : ''}\n${tweets.case.text}\n\n_字符数: ${tweets.case.length || tweets.case.text.length}/280_${tweets.case.truncated ? ` | _原始: ${tweets.case.original_length}_` : ''}\n_理由: ${tweets.case.rationale}_\n_风险: ${tweets.case.risk}_`
    }
  },
  {
    "type": "divider"
  },
  {
    "type": "section",
    "text": {
      "type": "mrkdwn",
      "text": "*📚 今日素材（Top 10）*"
    }
  }
];

// Add sources with category grouping and filtering
// Step 1: Apply category filter
let filteredSources = sources;
if (includeCategories && includeCategories.length > 0) {
  filteredSources = sources.filter(s =>
    includeCategories.includes((s.score?.category || 'unknown').toLowerCase())
  );
}
if (excludeCategories.length > 0) {
  filteredSources = filteredSources.filter(s =>
    !excludeCategories.includes((s.score?.category || 'unknown').toLowerCase())
  );
}

// Step 2: Event clustering view (if enabled and clusters exist)
const hasClusteredItems = filteredSources.some(s => s.cluster && s.cluster.clusterId);

if (eventViewEnabled && hasClusteredItems) {
  // Group by cluster
  const clusterGroups = new Map();
  const noiseItems = [];

  filteredSources.forEach(source => {
    if (source.cluster && source.cluster.clusterId) {
      const clusterId = source.cluster.clusterId;
      if (!clusterGroups.has(clusterId)) {
        clusterGroups.set(clusterId, {
          cluster: source.cluster,
          articles: []
        });
      }
      clusterGroups.get(clusterId).articles.push(source);
    } else {
      noiseItems.push(source);
    }
  });

  // Render event clusters first
  if (clusterGroups.size > 0) {
    blocks.push({
      "type": "section",
      "text": { "type": "mrkdwn", "text": `*📰 事件聚类* (${clusterGroups.size}个事件)` }
    });

    for (const [clusterId, { cluster, articles }] of clusterGroups) {
      // Sort articles by score
      articles.sort((a, b) => (b.score?.total || 0) - (a.score?.total || 0));

      const clusterText = formatEventCluster(cluster, articles);
      blocks.push({
        "type": "section",
        "text": { "type": "mrkdwn", "text": clusterText }
      });
    }
  }

  // Render noise items (independent content)
  if (noiseItems.length > 0) {
    blocks.push({
      "type": "section",
      "text": { "type": "mrkdwn", "text": `*📄 独立内容* (${noiseItems.length}条)` }
    });

    noiseItems.forEach((source, idx) => {
      const s = source.score || {};
      const categoryEmoji = {
        'announcement': '📢', 'insight': '💡', 'tool': '🛠️',
        'case': '📊', 'research': '🔬', 'risk': '⚠️'
      }[s.category] || '📄';

      blocks.push({
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `${idx + 1}. ${categoryEmoji} *${source.title}*\n来源: ${source.source} | 总分: ${s.total || 0}/30\n<${source.url}|查看链接>`
        }
      });
    });
  }
} else if (groupByCategory && filteredSources.length > 0) {
  // Group by category
  const groupedSources = {};
  filteredSources.forEach((source) => {
    const cat = source.score?.category || 'unknown';
    if (!groupedSources[cat]) groupedSources[cat] = [];
    groupedSources[cat].push(source);
  });

  // Render grouped
  let itemIdx = 0;
  categoryOrder.forEach((cat) => {
    const items = groupedSources[cat];
    if (!items || items.length === 0) return;

    // Category header
    blocks.push({
      "type": "section",
      "text": { "type": "mrkdwn", "text": `*${categoryLabels[cat]}* (${items.length})` }
    });

    // Items in this category
    items.forEach((source) => {
      itemIdx++;
      const s = source.score || {};
      blocks.push({
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `${itemIdx}. *${source.title}*\n来源: ${source.source} | 总分: ${s.total || 0}/30\n时效${s.timeliness || 0} 影响${s.impact || 0} 可行动${s.actionability || 0} 相关${s.relevance || 0}\n<${source.url}|查看链接>`
        }
      });
    });
  });
} else {
  // Flat list (original behavior)
  filteredSources.forEach((source, idx) => {
    const s = source.score || {};
    const categoryEmoji = {
      'announcement': '📢',
      'insight': '💡',
      'tool': '🛠️',
      'case': '📊',
      'research': '🔬',
      'risk': '⚠️'
    }[s.category] || '📄';

    blocks.push({
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": `${idx + 1}. ${categoryEmoji} *${source.title}*\n来源: ${source.source} | 总分: ${s.total || 0}/30\n时效${s.timeliness || 0} 影响${s.impact || 0} 可行动${s.actionability || 0} 相关${s.relevance || 0}\n<${source.url}|查看链接>`
      }
    });
  });
}

// Add pipeline stats section for observability
const stats = data.pipeline_stats;
if (stats) {
  const tierBreakdown = Object.entries(stats.by_tier || {})
    .map(([tier, count]) => `${tier}: ${count}`)
    .join(' | ');
  const sourceBreakdown = Object.entries(stats.by_source_type || {})
    .map(([type, count]) => `${type}: ${count}`)
    .join(' | ');
  const categoryBreakdown = Object.entries(stats.by_category || {})
    .map(([cat, count]) => `${categoryLabels[cat]?.split(' ')[0] || '📄'}${count}`)
    .join(' ');
  const scoreDist = stats.score_distribution || {};

  blocks.push(
    { "type": "divider" },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": `📊 *运行统计* | 候选: ${stats.total_candidates || 0} | 平均分: ${stats.avg_score || 0}/30 | 高分(≥24): ${scoreDist.high || 0} | 中分(18-23): ${scoreDist.medium || 0}`
        }
      ]
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": `📁 来源: ${sourceBreakdown} | 📈 Tier: ${tierBreakdown}`
        }
      ]
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": `📂 分类: ${categoryBreakdown}`
        }
      ]
    }
  );
}

// Send to Slack
try {
  const packMetadata = {
    event_type: 'x_daily_pack',
    event_payload: {
      version: 1,
      generated_at: data.generated_at || new Date().toISOString(),
      tweets: {
        hot_take: tweets?.hot_take?.text || '',
        framework: tweets?.framework?.text || '',
        case: tweets?.case?.text || ''
      },
      sources: (sources || []).slice(0, 10).map((s) => ({
        title: s?.title || '',
        url: s?.url || '',
        source: s?.source || '',
        score: s?.score?.total || 0
      }))
    }
  };

  const response = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://slack.com/api/chat.postMessage',
    headers: {
      'Authorization': `Bearer ${slackToken}`,
      'Content-Type': 'application/json'
    },
    body: {
      channel: channelId,
      blocks: blocks,
      metadata: packMetadata,
      text: 'Today\'s X Daily Pack'
    }
  });

  if (!response.ok) {
    throw new Error(`Slack API error: ${response.error}`);
  }

  return [{
    json: {
      success: true,
      message_ts: response.ts,
      channel: response.channel
    }
  }];
} catch (error) {
  throw new Error(`Slack send failed: ${error.message}`);
}
