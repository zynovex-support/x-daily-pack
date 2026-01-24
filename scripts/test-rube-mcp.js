#!/usr/bin/env node
/**
 * Rube MCP Connection Test
 * Tests if Rube MCP API is accessible and TWITTER_RECENT_SEARCH tool works
 *
 * Usage: RUBE_AUTH_TOKEN=your_token node scripts/test-rube-mcp.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env file manually
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

const rubeUrl = process.env.RUBE_MCP_URL || 'https://rube.app/mcp';
const rubeToken = process.env.RUBE_AUTH_TOKEN;

if (!rubeToken) {
  console.error('❌ Missing RUBE_AUTH_TOKEN in .env');
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
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function parseBody(body) {
  if (!body) return null;
  const trimmed = body.trim();

  // Try JSON first
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch (err) {
      // Fall through to SSE parsing
    }
  }

  // Parse SSE format
  const lines = trimmed.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
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
}

async function mcpPost(payload, includeProtocolHeader = true) {
  const headers = {
    'Authorization': `Bearer ${rubeToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream'
  };

  if (includeProtocolHeader && mcpProtocolVersion) {
    headers['MCP-Protocol-Version'] = mcpProtocolVersion;
  }
  if (includeProtocolHeader && mcpSessionId) {
    headers['Mcp-Session-Id'] = mcpSessionId;
  }

  const response = await httpRequest(rubeUrl, { method: 'POST', headers }, payload);
  const parsedBody = parseBody(response.body);

  return {
    statusCode: response.statusCode,
    body: parsedBody || response.body,
    headers: response.headers
  };
}

async function test() {
  console.log('🔍 Testing Rube MCP Connection...\n');
  console.log(`URL: ${rubeUrl}`);
  console.log(`Token: ${rubeToken.substring(0, 20)}...`);
  console.log('');

  try {
    // Step 1: Initialize
    console.log('1️⃣ Initializing MCP session...');
    const initPayload = {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'initialize',
      params: {
        protocolVersion: mcpProtocolVersion,
        capabilities: {},
        clientInfo: { name: 'test-script', version: '1.0.0' }
      }
    };

    const initResponse = await mcpPost(initPayload, false);
    console.log(`   Status: ${initResponse.statusCode}`);

    if (initResponse.statusCode !== 200) {
      console.error(`   ❌ Init failed: ${JSON.stringify(initResponse.body)}`);
      return;
    }

    const initResult = initResponse.body?.result;
    if (initResult?.protocolVersion) {
      mcpProtocolVersion = initResult.protocolVersion;
      console.log(`   ✅ Protocol version: ${mcpProtocolVersion}`);
    }

    const sessionHeader = initResponse.headers['mcp-session-id'];
    if (sessionHeader) {
      mcpSessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
      console.log(`   ✅ Session ID: ${mcpSessionId}`);
    }

    // Step 2: Send initialized notification
    console.log('\n2️⃣ Sending initialized notification...');
    await mcpPost({ jsonrpc: '2.0', method: 'notifications/initialized' }, true);
    console.log('   ✅ Notification sent');

    // Step 3: List available tools
    console.log('\n3️⃣ Listing available tools...');
    const listToolsPayload = {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/list',
      params: {}
    };

    const toolsResponse = await mcpPost(listToolsPayload, true);
    console.log(`   Status: ${toolsResponse.statusCode}`);

    if (toolsResponse.statusCode === 200) {
      const tools = toolsResponse.body?.result?.tools || [];
      console.log(`   ✅ Found ${tools.length} tools`);

      const twitterTool = tools.find(t => t.name === 'TWITTER_RECENT_SEARCH' || t.name === 'RUBE_MULTI_EXECUTE_TOOL');
      if (twitterTool) {
        console.log(`   ✅ Twitter tool available: ${twitterTool.name}`);
      } else {
        console.log('   ⚠️  Twitter tools:');
        tools.filter(t => t.name.includes('TWITTER')).forEach(t => {
          console.log(`      - ${t.name}`);
        });
      }
    } else {
      console.error(`   ❌ List tools failed: ${JSON.stringify(toolsResponse.body)}`);
    }

    // Step 4: Test Twitter search
    console.log('\n4️⃣ Testing Twitter search...');
    const searchPayload = {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: {
        name: 'RUBE_MULTI_EXECUTE_TOOL',
        arguments: {
          tools: [{
            tool_slug: 'TWITTER_RECENT_SEARCH',
            arguments: {
              query: 'AI agent -is:retweet lang:en',
              max_results: 5,
              tweet_fields: ['created_at', 'author_id'],
              expansions: ['author_id'],
              user_fields: ['username']
            }
          }]
        }
      }
    };

    const searchResponse = await mcpPost(searchPayload, true);
    console.log(`   Status: ${searchResponse.statusCode}`);

    if (searchResponse.statusCode === 200) {
      const fullResponse = JSON.stringify(searchResponse.body, null, 2);
      console.log('   ✅ Search request successful');
      console.log(`   Full Response:\n${fullResponse}`);

      // Try to extract error details
      const result = searchResponse.body?.result;
      if (result?.isError) {
        console.error('   ❌ Tool execution failed!');
        if (result.content) {
          result.content.forEach(item => {
            if (item.type === 'text') {
              console.error(`   Error details: ${item.text}`);
            }
          });
        }
      }
    } else {
      console.error(`   ❌ Search failed: ${JSON.stringify(searchResponse.body)}`);
    }

    console.log('\n✅ Test completed!');

  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    console.error(error.stack);
  }
}

test();
