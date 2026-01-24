#!/usr/bin/env node
/**
 * Check Rube Connections Status
 * Checks if Twitter/X account is properly connected
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
  console.log('🔍 Checking Rube Connections...\n');

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

    // Check connections
    console.log('\n2️⃣ Checking connections...');
    const connectionsResponse = await mcpPost({
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: {
        name: 'RUBE_MANAGE_CONNECTIONS',
        arguments: {
          action: 'list'
        }
      }
    }, true);

    console.log(`   Status: ${connectionsResponse.statusCode}`);
    console.log(`   Full Response:\n${JSON.stringify(connectionsResponse.body, null, 2)}`);

    const result = connectionsResponse.body?.result;
    if (result?.content) {
      result.content.forEach(item => {
        if (item.type === 'text') {
          console.log(`\n   📋 Connections:\n${item.text}`);

          // Try to parse as JSON
          try {
            const data = JSON.parse(item.text);
            if (data.connections) {
              console.log(`\n   Found ${data.connections.length} connection(s):`);
              data.connections.forEach(conn => {
                console.log(`   - ${conn.provider || conn.type || 'Unknown'}: ${conn.status || 'N/A'}`);
              });
            }
          } catch (err) {
            // Not JSON, just print as is
          }
        }
      });
    }

    // Try to search available tools
    console.log('\n3️⃣ Searching for Twitter tools...');
    const searchResponse = await mcpPost({
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: {
        name: 'RUBE_SEARCH_TOOLS',
        arguments: {
          query: 'twitter'
        }
      }
    }, true);

    console.log(`   Status: ${searchResponse.statusCode}`);
    const searchResult = searchResponse.body?.result;
    if (searchResult?.content) {
      searchResult.content.forEach(item => {
        if (item.type === 'text') {
          console.log(`\n   🔍 Twitter Tools:\n${item.text}`);
        }
      });
    }

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    console.error(error.stack);
  }
}

test();
