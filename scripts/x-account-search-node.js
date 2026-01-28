// X Account Timeline Node - Calls Rube MCP (Streamable HTTP)
// Fetches recent tweets from configured accounts using RUBE_MULTI_EXECUTE_TOOL

const rubeUrl = $env.RUBE_MCP_URL || 'https://rube.app/mcp';
const rubeToken = $env.RUBE_AUTH_TOKEN || $env.RUBE_API_TOKEN;

if (!rubeToken) {
  throw new Error('Missing Rube token. Set RUBE_AUTH_TOKEN (or RUBE_API_TOKEN).');
}

// 默认账号查询 (fallback)
const DEFAULT_ACCOUNT_QUERY = 'from:AnthropicAI OR from:OpenAI OR from:LangChainAI OR from:hwchase17 OR from:karpathy OR from:sama OR from:ylecun OR from:goodside OR from:simonw OR from:swyx OR from:nvidia OR from:awscloud OR from:Microsoft OR from:GoogleAI OR from:ycombinator -is:retweet -giveaway -airdrop';

// 从配置服务器获取查询（带 API Key 认证）
const CONFIG_URL = $env.CONFIG_SERVER_URL || 'http://localhost:3001';
const CONFIG_API_KEY = $env.CONFIG_API_KEY;
const configHeaders = CONFIG_API_KEY ? { 'X-API-Key': CONFIG_API_KEY } : undefined;
let accountQuery = DEFAULT_ACCOUNT_QUERY;

try {
  const configResp = await this.helpers.httpRequest({
    method: 'GET',
    url: `${CONFIG_URL}/queries/x-accounts`,
    headers: configHeaders,
    timeout: 5000
  });
  const data = typeof configResp === 'string' ? JSON.parse(configResp) : configResp;
  if (data.query) {
    accountQuery = data.query;
    console.log(`[X Accounts] Loaded query from config server`);
  }
} catch (err) {
  console.log(`[X Accounts] Config fetch failed (${err.message}), using defaults`);
}

let mcpProtocolVersion = '2025-06-18';
let mcpSessionId = null;
let requestId = 1;

const allTweets = [];
const seenTweetIds = new Set();

const getHeader = (headers, name) => {
  if (!headers) return null;
  const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
};

const parseSseEvents = (text) => {
  const events = [];
  const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      events.push(JSON.parse(payload));
    } catch (err) {
      continue;
    }
  }
  return events;
};

const parseSse = (text) => {
  const events = parseSseEvents(text);
  return events.length ? events[events.length - 1] : null;
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientRubeError = (message) => {
  if (!message) return false;
  return /tools failed|rate limit|temporar|timeout|429|503/i.test(message);
};

const normalizeRubeBody = (body) => {
  if (!body || typeof body !== 'object') return null;
  return body.result || body;
};

const unwrapData = (obj) => {
  let current = obj;
  for (let i = 0; i < 2; i += 1) {
    if (current && typeof current === 'object' && current.data) {
      current = current.data;
    }
  }
  return current;
};

const extractRubePayloads = (body) => {
  const root = normalizeRubeBody(body);
  const candidates = [];
  if (!root) return candidates;
  if (root.data) candidates.push(root.data);
  if (Array.isArray(root.content)) {
    root.content.forEach((entry) => {
      if (entry?.json) candidates.push(entry.json);
      if (entry?.data) candidates.push(entry.data);
      if (entry?.text) {
        try {
          candidates.push(JSON.parse(entry.text));
        } catch (err) {
          candidates.push(entry.text);
        }
      }
    });
  }
  candidates.push(root);
  return candidates;
};

const extractRubeError = (body) => {
  if (!body) return null;
  if (typeof body === 'string') {
    return /tools failed|error|failed/i.test(body) ? body : null;
  }
  if (body.error?.message) return body.error.message;
  if (typeof body.error === 'string') return body.error;

  const root = normalizeRubeBody(body) || body;
  if (root?.error?.message) return root.error.message;
  if (typeof root?.error === 'string') return root.error;

  const candidates = extractRubePayloads(body);
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === 'string') {
      if (/tools failed|error|failed/i.test(candidate)) return candidate;
      continue;
    }
    if (candidate.error?.message) return candidate.error.message;
    if (typeof candidate.error === 'string') return candidate.error;
    if (candidate.message && /error|failed/i.test(String(candidate.message))) return candidate.message;
  }
  return null;
};

const extractRubeDetails = (body) => {
  const candidates = extractRubePayloads(body);
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const details = candidate.details || candidate.detail;
    if (details?.requestId) return { requestId: details.requestId };
    if (candidate.requestId) return { requestId: candidate.requestId };
    if (candidate.log_id) return { logId: candidate.log_id };
  }
  return {};
};

const assertRubeSuccess = (body, label) => {
  const err = extractRubeError(body);
  if (err) {
    const details = extractRubeDetails(body);
    const suffixParts = [];
    if (details.requestId) suffixParts.push(`requestId=${details.requestId}`);
    if (details.logId) suffixParts.push(`logId=${details.logId}`);
    const suffix = suffixParts.length ? ` (${suffixParts.join(', ')})` : '';
    throw new Error(`${label} failed: ${err}${suffix}`);
  }
};

const extractSearchResult = (body) => {
  for (const candidate of extractRubePayloads(body)) {
    const data = unwrapData(candidate);
    if (data?.results || data?.session_id || data?.session) return data;
  }
  return null;
};

const extractConnectionResult = (body) => {
  for (const candidate of extractRubePayloads(body)) {
    const data = unwrapData(candidate);
    if (data?.connections || data?.active_connection !== undefined) return data;
    if (data?.results || data?.toolkit_connection_statuses) return data;
  }
  return null;
};

const resolveSessionId = (searchData) => {
  const data = unwrapData(searchData);
  if (!data) return null;
  if (data.session?.id) return data.session.id;
  if (data.session_id) return data.session_id;
  const first = Array.isArray(data.results) ? data.results[0] : null;
  if (first?.session_id) return first.session_id;
  if (first?.session?.id) return first.session.id;
  return null;
};

const resolveToolContext = (searchData) => {
  const data = unwrapData(searchData);
  const results = Array.isArray(data?.results) ? data.results : [];
  const primary = results[0] || {};
  const mainTools = Array.isArray(primary?.main_tools)
    ? primary.main_tools
    : (Array.isArray(primary?.tools) ? primary.tools : []);
  let toolSlug = primary?.primary_tool_slugs?.[0] || mainTools[0]?.tool_slug || mainTools[0]?.name || null;
  if (!toolSlug) {
    const schemaKeys = Object.keys(data?.tool_schemas || {});
    if (schemaKeys.length > 0) {
      toolSlug = schemaKeys.includes('TWITTER_RECENT_SEARCH') ? 'TWITTER_RECENT_SEARCH' : schemaKeys[0];
    }
  }
  const toolkits = [];
  if (Array.isArray(primary?.toolkits)) toolkits.push(...primary.toolkits);
  if (Array.isArray(data?.toolkits)) toolkits.push(...data.toolkits);
  if (Array.isArray(data?.toolkit_connection_statuses)) {
    data.toolkit_connection_statuses.forEach((entry) => {
      if (entry?.toolkit) toolkits.push(entry.toolkit);
    });
  }
  if (mainTools[0]?.toolkit_name) toolkits.push(mainTools[0].toolkit_name);
  if (mainTools[0]?.toolkit) toolkits.push(mainTools[0].toolkit);
  let activeConnection = primary?.active_connection;
  if (activeConnection === undefined && Array.isArray(data?.toolkit_connection_statuses)) {
    if (data.toolkit_connection_statuses.length > 0) {
      activeConnection = data.toolkit_connection_statuses.every((entry) => entry?.has_active_connection !== false);
    }
  }
  return {
    toolSlug,
    toolkits: [...new Set(toolkits.filter(Boolean))],
    activeConnection
  };
};

const findTweetsEnvelope = (obj) => {
  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj.data)) return obj;
  if (obj.data && Array.isArray(obj.data.data)) return obj.data;
  return null;
};

const findMultiExecuteEnvelope = (obj) => {
  const results = obj?.data?.data?.results;
  if (!Array.isArray(results)) return null;
  for (const result of results) {
    const envelope = findTweetsEnvelope(result?.response?.data);
    if (envelope) return envelope;
  }
  return null;
};

const extractTwitterPayload = (response) => {
  const root = response?.result || response;
  const candidates = [];
  if (root?.data) candidates.push(root.data);
  if (Array.isArray(root?.content)) {
    root.content.forEach((entry) => {
      if (entry?.json) candidates.push(entry.json);
      if (entry?.data) candidates.push(entry.data);
      if (entry?.text) {
        try {
          candidates.push(JSON.parse(entry.text));
        } catch (err) {
          // ignore parse errors
        }
      }
    });
  }
  candidates.push(root);
  for (const candidate of candidates) {
    const envelope = findTweetsEnvelope(candidate);
    if (envelope) return envelope;
    const multiEnvelope = findMultiExecuteEnvelope(candidate);
    if (multiEnvelope) return multiEnvelope;
  }
  return null;
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
    returnFullResponse: true,
    responseFormat: 'string'
  });

  const rawBody = response?.body ?? response;
  const parsedBody = parseBody(rawBody);
  return {
    body: parsedBody || rawBody,
    headers: response?.headers
  };
};

const initializeMcp = async () => {
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

const searchTools = async (query) => {
  const payload = {
    jsonrpc: '2.0',
    id: requestId++,
    method: 'tools/call',
    params: {
      name: 'RUBE_SEARCH_TOOLS',
      arguments: {
        queries: [
          {
            use_case: 'search recent tweets on twitter',
            known_fields: `query: ${query}`
          }
        ],
        session: { generate_id: true }
      }
    }
  };

  const response = await mcpPost(payload, true);
  assertRubeSuccess(response.body, 'Rube search tools');
  const searchData = extractSearchResult(response.body);
  if (!searchData) throw new Error('Rube search tools returned empty payload');
  return searchData;
};

const ensureActiveConnections = async (toolkits, sessionId) => {
  if (!Array.isArray(toolkits) || toolkits.length === 0) return;
  const payload = {
    jsonrpc: '2.0',
    id: requestId++,
    method: 'tools/call',
    params: {
      name: 'RUBE_MANAGE_CONNECTIONS',
      arguments: {
        toolkits,
        session_id: sessionId
      }
    }
  };

  const response = await mcpPost(payload, true);
  assertRubeSuccess(response.body, 'Rube manage connections');
  const connData = extractConnectionResult(response.body);
  if (!connData) return;

  const toolkitStatuses = connData.toolkit_connection_statuses;
  if (Array.isArray(toolkitStatuses) && toolkitStatuses.length > 0) {
    const inactive = toolkitStatuses.find((entry) => entry?.has_active_connection === false);
    if (inactive) {
      const detail = inactive.status_message || inactive.description || 'inactive';
      throw new Error(`Rube connection not ACTIVE: ${detail}`);
    }
  }

  const results = connData.results;
  if (results && typeof results === 'object' && !Array.isArray(results)) {
    const entries = Object.values(results);
    const inactive = entries.find((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      if (entry.has_active_connection === false) return true;
      const status = entry.connection_status || entry.status;
      return status ? String(status).toUpperCase() !== 'ACTIVE' : false;
    });
    if (inactive) {
      const status = inactive.connection_status || inactive.status || 'UNKNOWN';
      const detail = inactive.instruction || inactive.status_message || inactive.description;
      const suffix = detail ? ` - ${detail}` : '';
      throw new Error(`Rube connection not ACTIVE: ${status}${suffix}`);
    }
  }

  const connections = connData.connections || [];
  if (Array.isArray(connections) && connections.length > 0) {
    const inactive = connections.find((conn) => {
      const status = conn.connection_status || conn.status;
      return status && status !== 'ACTIVE';
    });
    if (inactive) {
      const status = inactive.connection_status || inactive.status || 'UNKNOWN';
      const redirect = inactive.redirect_url ? ` (open: ${inactive.redirect_url})` : '';
      throw new Error(`Rube connection not ACTIVE: ${status}${redirect}`);
    }
  } else if (connData.active_connection === false) {
    throw new Error('Rube connection not ACTIVE');
  }
};

const executeWithRetry = async (payload, label, maxAttempts = 3) => {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await mcpPost(payload, true);
      assertRubeSuccess(response.body, label);
      return response;
    } catch (error) {
      lastError = error;
      const message = error?.message || String(error);
      if (attempt < maxAttempts && isTransientRubeError(message)) {
        await sleep(600 * attempt);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
};

try {
  await initializeMcp();

  const searchData = await searchTools(accountQuery);
  const sessionId = resolveSessionId(searchData);
  if (!sessionId) throw new Error('Rube search tools missing session_id');

  const toolContext = resolveToolContext(searchData);
  if (!toolContext.toolSlug) throw new Error('Rube search tools missing tool slug');

  const resolvedToolkits = toolContext.toolkits.length
    ? toolContext.toolkits
    : (toolContext.toolSlug?.startsWith('TWITTER_') ? ['twitter'] : []);
  await ensureActiveConnections(resolvedToolkits, sessionId);

  const payload = {
    jsonrpc: '2.0',
    id: requestId++,
    method: 'tools/call',
    params: {
      name: 'RUBE_MULTI_EXECUTE_TOOL',
      arguments: {
        tools: [
          {
            tool_slug: toolContext.toolSlug,
            arguments: {
              query: accountQuery,
              max_results: 30,
              tweet_fields: ['created_at', 'public_metrics', 'author_id'],
              expansions: ['author_id'],
              user_fields: ['username', 'name']
            }
          }
        ],
        sync_response_to_workbench: false,
        memory: {},
        session_id: sessionId,
        current_step: 'FETCH_ACCOUNT_TWEETS',
        current_step_metric: '1/1'
      }
    }
  };

  const response = await executeWithRetry(payload, 'Rube X account search');
  const twitterPayload = extractTwitterPayload(response.body);
  if (!twitterPayload) {
    console.log('Rube X account search returned empty payload');
  }
  const tweets = twitterPayload?.data || [];
  const users = twitterPayload?.includes?.users || [];

  const userMap = {};
  users.forEach((user) => {
    userMap[user.id] = user;
  });

  tweets.forEach((tweet) => {
    if (seenTweetIds.has(tweet.id)) return;
    seenTweetIds.add(tweet.id);
    const author = userMap[tweet.author_id] || {};
    const username = author.username || 'unknown';
    allTweets.push({
      title: tweet.text.substring(0, 100) + (tweet.text.length > 100 ? '...' : ''),
      url: `https://twitter.com/${username}/status/${tweet.id}`,
      source: `X - @${username}`,
      snippet: tweet.text,
      publishedAt: tweet.created_at,
      author: username,
      metrics: tweet.public_metrics || {},
      sourceType: 'X',
      tier: 'B'
    });
  });

  return allTweets.map(tweet => ({ json: tweet }));
} catch (error) {
  throw new Error(`X account search failed: ${error.message}`);
}
