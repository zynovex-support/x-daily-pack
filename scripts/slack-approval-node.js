// Slack Approval Processor (polling) for n8n
// - Scans recent pack messages (by Block Kit header)
// - Looks for commands like: post 1|2|3（支持线程回复，也容错频道顶层命令，自动关联到最近一条 pack）
// - Replies in the thread with dry-run or posts to X via Rube MCP
// - Idempotent via Slack ack marker (no workflow static data required)

const slackToken = $env.SLACK_BOT_TOKEN;
const channelId = $env.SLACK_CHANNEL_ID;
const xWriteEnabled = String($env.X_WRITE_ENABLED || '').toLowerCase() === 'true';

const rubeUrl = $env.RUBE_MCP_URL || 'https://rube.app/mcp';
const rubeToken = $env.RUBE_AUTH_TOKEN || $env.RUBE_API_TOKEN;

const maxThreads = Number.parseInt($env.SLACK_APPROVAL_MAX_THREADS || '10', 10);
const maxReplies = Number.parseInt($env.SLACK_APPROVAL_MAX_REPLIES || '200', 10);
const maxCommandAgeMinutes = Number.parseInt($env.SLACK_APPROVAL_MAX_AGE_MINUTES || '240', 10); // default 4h

if (!slackToken) throw new Error('Missing SLACK_BOT_TOKEN');
if (!channelId) throw new Error('Missing SLACK_CHANNEL_ID');
if (xWriteEnabled && !rubeToken) throw new Error('Missing RUBE_AUTH_TOKEN (required when X_WRITE_ENABLED=true)');

const COMMAND_HELP = '可用指令：`post 1` / `post 2` / `post 3`（推荐在线程里回复；若发在频道顶层，会自动关联到最近一条 pack）';
const ACK_PREFIX = 'x_daily_pack_ack';

const normalizeText = (value) => String(value || '').trim();
const toNumberTs = (ts) => {
  const num = Number.parseFloat(String(ts || '0'));
  return Number.isFinite(num) ? num : 0;
};

const slackApi = async (method, params) => {
  const response = await this.helpers.httpRequest({
    method: 'GET',
    url: `https://slack.com/api/${method}`,
    headers: { Authorization: `Bearer ${slackToken}` },
    qs: params
  });

  if (!response?.ok) {
    const err = response?.error || 'unknown_error';
    const needed = response?.needed ? ` (needed: ${response.needed})` : '';
    const provided = response?.provided ? ` (provided: ${response.provided})` : '';
    throw new Error(`Slack API ${method} failed: ${err}${needed}${provided}`);
  }
  return response;
};

const slackPost = async (payload) => {
  const response = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://slack.com/api/chat.postMessage',
    headers: {
      Authorization: `Bearer ${slackToken}`,
      'Content-Type': 'application/json'
    },
    body: payload
  });

  if (!response?.ok) {
    const err = response?.error || 'unknown_error';
    const needed = response?.needed ? ` (needed: ${response.needed})` : '';
    const provided = response?.provided ? ` (provided: ${response.provided})` : '';
    throw new Error(`Slack API chat.postMessage failed: ${err}${needed}${provided}`);
  }
  return response;
};

let mcpProtocolVersion = '2025-06-18';
let mcpSessionId = null;
let requestId = 1;

const getHeader = (headers, name) => {
  if (!headers) return null;
  const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
};

const parseSse = (text) => {
  const lines = String(text || '').split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      return JSON.parse(payload);
    } catch (err) {
      continue;
    }
  }
  return null;
};

const parseBody = (body) => {
  if (!body) return null;
  if (typeof body === 'string') {
    const trimmed = body.trim();
    if (trimmed.startsWith('{')) {
      try {
        return JSON.parse(trimmed);
      } catch (err) {
        return null;
      }
    }
    return parseSse(trimmed);
  }
  return body;
};

const mcpPost = async (payload, includeProtocolHeader = true) => {
  const headers = {
    Authorization: `Bearer ${rubeToken}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream'
  };
  if (includeProtocolHeader && mcpProtocolVersion) headers['MCP-Protocol-Version'] = mcpProtocolVersion;
  if (includeProtocolHeader && mcpSessionId) headers['Mcp-Session-Id'] = mcpSessionId;

  const response = await this.helpers.httpRequest({
    method: 'POST',
    url: rubeUrl,
    headers,
    body: payload,
    returnFullResponse: true
  });

  const rawBody = response?.body ?? response;
  const parsedBody = parseBody(rawBody);
  return {
    body: parsedBody || rawBody,
    headers: response?.headers
  };
};

const initializeMcp = async () => {
  if (!xWriteEnabled) return;
  const initPayload = {
    jsonrpc: '2.0',
    id: requestId++,
    method: 'initialize',
    params: {
      protocolVersion: mcpProtocolVersion,
      capabilities: {},
      clientInfo: { name: 'n8n', version: '1.0.0' }
    }
  };

  const initResponse = await mcpPost(initPayload, false);
  const initResult = initResponse.body?.result;
  if (initResult?.protocolVersion) {
    mcpProtocolVersion = initResult.protocolVersion;
  }

  const sessionHeader = getHeader(initResponse.headers, 'mcp-session-id');
  if (sessionHeader) {
    mcpSessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
  }

  await mcpPost({ jsonrpc: '2.0', method: 'notifications/initialized' }, true);
};

const parseCommand = (text) => {
  const normalized = normalizeText(text).toLowerCase();
  const m = normalized.match(/^(post|publish|发|发布)\s*([123])\b/);
  if (!m) return null;
  return { type: 'post', option: Number(m[2]) };
};

const extractAckTs = (text) => {
  const match = String(text || '').match(/x_daily_pack_ack\s+cmd_ts=([0-9.]+)/i);
  return match?.[1] || null;
};

const isDailyPackMessage = (msg) => {
  const blocks = msg?.blocks;
  if (!Array.isArray(blocks) || blocks.length === 0) return false;
  const headerBlock = blocks.find((b) => b?.type === 'header');
  const text = headerBlock?.text?.text || headerBlock?.text?.plain_text || '';
  return String(text).includes("Today's X Daily Pack");
};

const extractDraftsFromBlocks = (blocks) => {
  const drafts = {};

  const extractFromSection = (sectionText) => {
    if (!sectionText) return '';
    const firstNewline = sectionText.indexOf('\n');
    const rest = firstNewline >= 0 ? sectionText.slice(firstNewline + 1) : sectionText;
    const marker = '\n\n_字符数';
    const markerIndex = rest.indexOf(marker);
    const tweetText = markerIndex >= 0 ? rest.slice(0, markerIndex) : rest;
    return tweetText.trim();
  };

  (blocks || []).forEach((block) => {
    if (block?.type !== 'section') return;
    const text = block?.text?.text;
    if (!text || typeof text !== 'string') return;
    if (text.includes('*Option 1:')) drafts[1] = extractFromSection(text);
    if (text.includes('*Option 2:')) drafts[2] = extractFromSection(text);
    if (text.includes('*Option 3:')) drafts[3] = extractFromSection(text);
  });

  return drafts;
};

const postTweet = async (text) => {
  const payload = {
    jsonrpc: '2.0',
    id: requestId++,
    method: 'tools/call',
    params: {
      name: 'RUBE_MULTI_EXECUTE_TOOL',
      arguments: {
        tools: [
          {
            tool_slug: 'TWITTER_CREATION_OF_A_POST',
            arguments: { text }
          }
        ]
      }
    }
  };

  const response = await mcpPost(payload, true);
  const root = response.body?.result || response.body;
  const content = root?.content;
  if (Array.isArray(content)) {
    const textEntry = content.find((entry) => entry?.type === 'text' && entry?.text);
    if (textEntry?.text) {
      try {
        return JSON.parse(textEntry.text);
      } catch (err) {
        return { raw: textEntry.text };
      }
    }
  }
  return root;
};

try {
  const history = await slackApi('conversations.history', {
    channel: channelId,
    limit: 50,
  });

  const historyMessages = history.messages || [];
  const nowMs = Date.now();
  const isFresh = (ts) => {
    if (!maxCommandAgeMinutes || maxCommandAgeMinutes <= 0) return true;
    const ageMs = nowMs - toNumberTs(ts) * 1000;
    return ageMs >= 0 && ageMs <= maxCommandAgeMinutes * 60 * 1000;
  };

  const packRoots = historyMessages
    .filter((msg) => isDailyPackMessage(msg))
    .filter((msg) => !msg.thread_ts || msg.thread_ts === msg.ts)
    .slice(0, Math.max(1, Math.min(maxThreads, 50)));

  if (!packRoots.length) return [];

  // sort roots for mapping top-level commands -> nearest preceding pack
  const packRootsAsc = [...packRoots].sort((a, b) => toNumberTs(a.ts) - toNumberTs(b.ts));

  // channel-level commands (non-thread); map to nearest preceding pack root
  const channelCommands = historyMessages
    .filter((msg) => !msg.thread_ts && !msg.bot_id && !msg.subtype && msg.user)
    .filter((msg) => isFresh(msg.ts))
    .map((msg) => ({ msg, cmd: parseCommand(msg.text) }))
    .filter((entry) => entry.cmd)
    .map((entry) => {
      const cmdTs = toNumberTs(entry.msg.ts);
      let targetRoot = null;
      for (const root of packRootsAsc) {
        if (cmdTs >= toNumberTs(root.ts)) targetRoot = root;
      }
      return { ...entry, targetThreadTs: targetRoot?.ts || null };
    })
    .filter((entry) => entry.targetThreadTs);

  await initializeMcp();

  const optionMap = { 1: 'hot_take', 2: 'framework', 3: 'case' };
  const results = [];

  for (const root of packRoots) {
    const threadTs = root?.ts;
    if (!threadTs) continue;

    const drafts = extractDraftsFromBlocks(root.blocks);
    if (!drafts[1] && !drafts[2] && !drafts[3]) continue;

    const replies = await slackApi('conversations.replies', {
      channel: channelId,
      ts: threadTs,
      limit: Math.max(20, Math.min(maxReplies, 200)),
    });

    const messages = replies.messages || [];

    const acked = new Set();
    for (const msg of messages) {
      if (!msg?.bot_id) continue;
      const ackTs = extractAckTs(msg.text);
      if (ackTs) acked.add(ackTs);
    }

    // collect thread commands + mapped channel commands
    const cmdsToProcess = [];
    for (const msg of messages) {
      if (!msg?.ts) continue;
      if (msg.ts === threadTs) continue; // root
      if (msg.subtype || msg.bot_id) continue;
      if (!msg.user) continue;
      if (!isFresh(msg.ts)) continue;
      cmdsToProcess.push({ msg, cmd: parseCommand(msg.text), source: 'thread' });
    }
    for (const entry of channelCommands) {
      if (entry.targetThreadTs !== threadTs) continue;
      cmdsToProcess.push({ msg: entry.msg, cmd: entry.cmd, source: 'channel' });
    }

    const seenCmdTs = new Set(); // guard against accidental duplicates within same run

    for (const entry of cmdsToProcess) {
      const msg = entry.msg;
      const cmd = entry.cmd;
      if (!msg?.ts || !cmd) continue;
      if (acked.has(msg.ts)) continue;
      if (seenCmdTs.has(msg.ts)) continue;
      seenCmdTs.add(msg.ts);

      const tweetText = drafts[cmd.option] || '';
      const ackMarker = `\n\n_(${ACK_PREFIX} cmd_ts=${msg.ts})_`;

      try {
        if (!tweetText) {
          await slackPost({
            channel: channelId,
            thread_ts: threadTs,
            text: `找不到 Option ${cmd.option} 的草稿内容。${COMMAND_HELP}${ackMarker}`
          });
          results.push({ json: { status: 'missing_draft', command_ts: msg.ts, thread_ts: threadTs, option: cmd.option } });
          continue;
        }

        if (!xWriteEnabled) {
          await slackPost({
            channel: channelId,
            thread_ts: threadTs,
            text: `🧪 Dry-run：将发布 Option ${cmd.option}\n\n${tweetText}\n\n如需真正发布，请在环境变量设置 X_WRITE_ENABLED=true 并重启 n8n。${ackMarker}`
          });
          results.push({ json: { status: 'dry_run', command_ts: msg.ts, thread_ts: threadTs, option: cmd.option } });
          continue;
        }

        const postResult = await postTweet(tweetText);
        await slackPost({
          channel: channelId,
          thread_ts: threadTs,
          text: `✅ 已发布 Option ${cmd.option}\n\n${tweetText}\n\n返回：${JSON.stringify(postResult).slice(0, 1500)}${ackMarker}`
        });

        results.push({ json: { status: 'posted', command_ts: msg.ts, thread_ts: threadTs, option: cmd.option } });
      } catch (err) {
        await slackPost({
          channel: channelId,
          thread_ts: threadTs,
          text: `❌ 执行失败：${err.message}\n${COMMAND_HELP}${ackMarker}`
        });
        results.push({ json: { status: 'failed', command_ts: msg.ts, thread_ts: threadTs, option: cmd.option, error: err.message } });
      }
    }
  }

  return results;
} catch (error) {
  throw new Error(`Slack approval poller failed: ${error.message}`);
}
