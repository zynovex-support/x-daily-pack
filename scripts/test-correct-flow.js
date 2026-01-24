#!/usr/bin/env node
/**
 * Test Correct Rube Flow for Twitter Search
 * Steps:
 * 1. RUBE_SEARCH_TOOLS - discover Twitter tools
 * 2. RUBE_MANAGE_CONNECTIONS - ensure Twitter connection is ACTIVE
 * 3. RUBE_MULTI_EXECUTE_TOOL - execute Twitter search
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
  console.log('🔍 Testing Correct Rube Flow for Twitter Search...\n');

  try {
    // Init MCP
    console.log('1️⃣ Initializing MCP...');
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

    // Step 1: RUBE_SEARCH_TOOLS
    console.log('\n2️⃣ Searching for Twitter tools...');
    const searchToolsResponse = await mcpPost({
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: {
        name: 'RUBE_SEARCH_TOOLS',
        arguments: {
          queries: [{
            use_case: 'search recent tweets on twitter',
            known_fields: 'query: AI agent'
          }],
          session: {
            generate_id: true
          }
        }
      }
    }, true);

    console.log(`   Status: ${searchToolsResponse.statusCode}`);
    const searchResult = searchToolsResponse.body?.result;
    if (searchResult?.content) {
      searchResult.content.forEach(item => {
        if (item.type === 'text') {
          console.log(`   Response: ${item.text.substring(0, 1000)}...`);

          // Parse to find tool slugs and session_id
          try {
            const outerData = JSON.parse(item.text);
            const data = outerData?.data?.data || outerData;

            // Check for session_id
            if (data.session_id) {
              console.log(`\n   🔑 Session ID: ${data.session_id}`);
              global.sessionId = data.session_id;
            }

            // Look in results array
            if (data.results && data.results.length > 0) {
              const result = data.results[0];

              // Check for session_id in result
              if (result.session_id) {
                console.log(`\n   🔑 Session ID: ${result.session_id}`);
                global.sessionId = result.session_id;
              }

              // Look for main_tools
              if (result.main_tools && result.main_tools.length > 0) {
                console.log(`\n   🎯 Found ${result.main_tools.length} main tools:`);
                result.main_tools.forEach(tool => {
                  console.log(`      - ${tool.tool_slug} (${tool.toolkit_name})`);
                });

                global.twitterToolSlug = result.main_tools[0].tool_slug;
                global.twitterToolkit = result.main_tools[0].toolkit_name;
              }

              // Show connection status
              if (result.active_connection !== undefined) {
                console.log(`\n   Connection: ${result.active_connection ? '✅ ACTIVE' : '❌ NOT ACTIVE'}`);
                global.connectionActive = result.active_connection;
              }
            }
          } catch (err) {
            console.log(`\n   ⚠️  Could not parse response: ${err.message}`);
          }
        }
      });
    }

    if (!global.sessionId || !global.twitterToolSlug) {
      console.error('\n❌ Could not find Twitter tools or session_id');
      return;
    }

    // Step 2: RUBE_MANAGE_CONNECTIONS
    console.log('\n3️⃣ Checking Twitter connection status...');
    const connectionsResponse = await mcpPost({
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: {
        name: 'RUBE_MANAGE_CONNECTIONS',
        arguments: {
          toolkits: [global.twitterToolkit],
          session_id: global.sessionId
        }
      }
    }, true);

    console.log(`   Status: ${connectionsResponse.statusCode}`);
    const connResult = connectionsResponse.body?.result;
    if (connResult?.content) {
      connResult.content.forEach(item => {
        if (item.type === 'text') {
          console.log(`   Connection info:\n   ${item.text}`);

          try {
            const data = JSON.parse(item.text);
            if (data.connections && data.connections.length > 0) {
              const twitterConn = data.connections[0];
              console.log(`\n   Status: ${twitterConn.connection_status}`);

              if (twitterConn.connection_status !== 'ACTIVE') {
                console.log(`\n   ⚠️  Twitter not connected!`);
                if (twitterConn.redirect_url) {
                  console.log(`   Please visit: ${twitterConn.redirect_url}`);
                }
                return;
              } else {
                console.log(`   ✅ Twitter connection is ACTIVE`);
                global.connectionActive = true;
              }
            }
          } catch (err) {
            console.log(`   ⚠️  Could not parse connection response`);
          }
        }
      });
    }

    if (!global.connectionActive) {
      console.error('\n❌ Twitter connection is not ACTIVE. Please connect first.');
      return;
    }

    // Step 3: RUBE_MULTI_EXECUTE_TOOL
    console.log('\n4️⃣ Executing Twitter search...');
    const executeResponse = await mcpPost({
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: {
        name: 'RUBE_MULTI_EXECUTE_TOOL',
        arguments: {
          tools: [{
            tool_slug: global.twitterToolSlug,
            arguments: {
              query: 'AI agent -is:retweet lang:en',
              max_results: 5
            }
          }],
          sync_response_to_workbench: false,
          memory: {},
          session_id: global.sessionId
        }
      }
    }, true);

    console.log(`   Status: ${executeResponse.statusCode}`);
    const execResult = executeResponse.body?.result;
    if (execResult?.content) {
      execResult.content.forEach(item => {
        if (item.type === 'text') {
          console.log(`\n   ✅ Search result:\n${item.text.substring(0, 1000)}...`);
        }
      });
    }

    console.log('\n✅ Test completed!');

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    console.error(error.stack);
  }
}

test();
