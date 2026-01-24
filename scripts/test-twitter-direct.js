#!/usr/bin/env node
/**
 * Direct Twitter Tool Test
 * Tests TWITTER_RECENT_SEARCH without MULTI_EXECUTE wrapper
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (!process.env[key]) process.env[key] = value;
    }
  });
}

const rubeUrl = process.env.RUBE_MCP_URL || 'https://rube.app/mcp';
const rubeToken = process.env.RUBE_AUTH_TOKEN;

if (!rubeToken) {
  console.error('❌ Missing RUBE_AUTH_TOKEN');
  process.exit(1);
}

let mcpProtocolVersion = '2025-06-18';
let mcpSessionId = null;
let requestId = 1;

function httpRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'POST',
      headers: options.headers || {}
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: data
      }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function parseBody(body) {
  if (!body) return null;
  const trimmed = body.trim();
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch (err) {}
  }
  // SSE
  const lines = trimmed.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      return JSON.parse(payload);
    } catch (err) {}
  }
  return null;
}

async function mcpPost(payload, includeHeaders = true) {
  const headers = {
    'Authorization': `Bearer ${rubeToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream'
  };
  if (includeHeaders && mcpProtocolVersion) headers['MCP-Protocol-Version'] = mcpProtocolVersion;
  if (includeHeaders && mcpSessionId) headers['Mcp-Session-Id'] = mcpSessionId;

  const response = await httpRequest(rubeUrl, { method: 'POST', headers }, payload);
  return {
    statusCode: response.statusCode,
    body: parseBody(response.body) || response.body,
    headers: response.headers
  };
}

async function test() {
  console.log('🔍 Testing Direct Twitter Tool...\n');

  try {
    // Init
    console.log('1️⃣ Initializing...');
    const initResponse = await mcpPost({
      jsonrpc: '2.0',
      id: requestId++,
      method: 'initialize',
      params: {
        protocolVersion: mcpProtocolVersion,
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0' }
      }
    }, false);

    if (initResponse.body?.result?.protocolVersion) {
      mcpProtocolVersion = initResponse.body.result.protocolVersion;
    }
    const sessionHeader = initResponse.headers['mcp-session-id'];
    if (sessionHeader) {
      mcpSessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
    }
    console.log('   ✅ Initialized');

    await mcpPost({ jsonrpc: '2.0', method: 'notifications/initialized' }, true);

    // List tools
    console.log('\n2️⃣ Listing tools...');
    const listResponse = await mcpPost({
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/list',
      params: {}
    }, true);

    const tools = listResponse.body?.result?.tools || [];
    console.log(`   Found ${tools.length} tools:`);
    tools.forEach(tool => {
      console.log(`   - ${tool.name}`);
    });

    // Test direct TWITTER_RECENT_SEARCH
    const hasDirectTwitter = tools.find(t => t.name === 'TWITTER_RECENT_SEARCH');

    if (hasDirectTwitter) {
      console.log('\n3️⃣ Testing TWITTER_RECENT_SEARCH directly...');
      const searchResponse = await mcpPost({
        jsonrpc: '2.0',
        id: requestId++,
        method: 'tools/call',
        params: {
          name: 'TWITTER_RECENT_SEARCH',
          arguments: {
            query: 'AI agent',
            max_results: 5
          }
        }
      }, true);

      console.log(`   Status: ${searchResponse.statusCode}`);
      console.log(`   Response:\n${JSON.stringify(searchResponse.body, null, 2)}`);
    } else {
      console.log('\n⚠️  TWITTER_RECENT_SEARCH not available as direct tool');
      console.log('   This confirms we must use RUBE_MULTI_EXECUTE_TOOL');
    }

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
  }
}

test();
