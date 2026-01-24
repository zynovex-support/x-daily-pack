#!/usr/bin/env python3
import json

# Read all node code files
print("Reading node code files...")

with open('/home/henry/x/scripts/llm-rank-node.js', 'r') as f:
    llm_rank_code = f.read()

with open('/home/henry/x/scripts/tweet-gen-node.js', 'r') as f:
    tweet_gen_code = f.read()

with open('/home/henry/x/scripts/slack-output-node.js', 'r') as f:
    slack_output_code = f.read()

with open('/home/henry/x/scripts/x-keyword-search-node.js', 'r') as f:
    x_keyword_code = f.read()

with open('/home/henry/x/scripts/x-account-search-node.js', 'r') as f:
    x_account_code = f.read()

print("Building workflow structure...")

# Build complete workflow with X integration
workflow = {
    "name": "X Daily Pack - Complete with X Integration",
    "nodes": [
        # Manual trigger (for CLI/testing)
        {
            "parameters": {},
            "name": "Manual Trigger",
            "type": "n8n-nodes-base.manualTrigger",
            "typeVersion": 1,
            "position": [120, 300],
            "id": "manual-trigger"
        },
        # Schedule trigger node
        {
            "parameters": {
                "rule": {
                    "interval": [{"field": "cronExpression", "expression": "0 8 * * *"}]
                }
            },
            "name": "Trigger 8AM",
            "type": "n8n-nodes-base.scheduleTrigger",
            "typeVersion": 1.1,
            "position": [240, 300],
            "id": "trigger"
        },
        # RSS HN node - FIXED: Using rssFeedRead instead of httpRequest
        {
            "parameters": {
                "url": "https://hnrss.org/best?count=15"
            },
            "name": "RSS HN",
            "type": "n8n-nodes-base.rssFeedRead",
            "typeVersion": 1,
            "position": [440, 150],
            "id": "rss-hn"
        },
        # RSS Google node - FIXED: Using rssFeedRead instead of httpRequest
        {
            "parameters": {
                "url": "https://news.google.com/rss/search?q=AI+OR+artificial+intelligence&hl=en"
            },
            "name": "RSS Google",
            "type": "n8n-nodes-base.rssFeedRead",
            "typeVersion": 1,
            "position": [440, 250],
            "id": "rss-google"
        },
        # X Keyword Search node
        {
            "parameters": {
                "jsCode": x_keyword_code
            },
            "name": "X Keyword Search",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [440, 350],
            "id": "x-keyword"
        },
        # X Account Search node
        {
            "parameters": {
                "jsCode": x_account_code
            },
            "name": "X Account Search",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [440, 450],
            "id": "x-account"
        },
        # Merge RSS node (2 inputs)
        {
            "parameters": {
                "mode": "append"
            },
            "name": "Merge RSS",
            "type": "n8n-nodes-base.merge",
            "typeVersion": 2.1,
            "position": [700, 200],
            "id": "merge-rss"
        },
        # Merge X node (2 inputs)
        {
            "parameters": {
                "mode": "append"
            },
            "name": "Merge X",
            "type": "n8n-nodes-base.merge",
            "typeVersion": 2.1,
            "position": [700, 400],
            "id": "merge-x"
        },
        # Merge All node (RSS + X)
        {
            "parameters": {
                "mode": "append"
            },
            "name": "Merge All",
            "type": "n8n-nodes-base.merge",
            "typeVersion": 2.1,
            "position": [940, 300],
            "id": "merge"
        },
        # Normalize node - Updated to handle RSS feed data structure
        {
            "parameters": {
                "jsCode": "// Normalize all data\nconst items = $input.all();\nconst normalized = [];\n\nfor (const item of items) {\n  const data = item.json;\n  const source = data.source || 'RSS';\n  const sourceType = source.startsWith('X -') ? 'X' : 'RSS';\n  normalized.push({\n    title: data.title || data.text || '',\n    url: data.link || data.url || '',\n    source,\n    sourceType,\n    snippet: (data.description || data.summary || data.text || data.snippet || '').substring(0, 300),\n    publishedAt: data.pubDate || data.isoDate || data.created_at || data.publishedAt || new Date().toISOString(),\n    author: data.author || data.username || '',\n    metrics: data.metrics || data.public_metrics || {}\n  });\n}\n\nreturn normalized.map(item => ({ json: item }));"
            },
            "name": "Normalize",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1140, 300],
            "id": "normalize"
        },
        # Dedupe node
        {
            "parameters": {
                "jsCode": "// Simple dedupe by URL\nconst items = $input.all();\nconst seen = new Set();\nconst unique = [];\n\nfor (const item of items) {\n  const url = item.json.url;\n  if (url && !seen.has(url)) {\n    seen.add(url);\n    unique.push(item);\n  }\n}\n\nreturn unique;"
            },
            "name": "Dedupe",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1340, 300],
            "id": "dedupe"
        },
        # LLM Rank node
        {
            "parameters": {
                "jsCode": llm_rank_code
            },
            "name": "LLM Rank",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1540, 300],
            "id": "llm-rank"
        },
        # Tweet Generation node
        {
            "parameters": {
                "jsCode": tweet_gen_code
            },
            "name": "Generate Tweets",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1740, 300],
            "id": "tweet-gen"
        },
        # Slack Output node
        {
            "parameters": {
                "jsCode": slack_output_code
            },
            "name": "Send to Slack",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1940, 300],
            "id": "slack-output"
        }
    ],
    "connections": {
        "Manual Trigger": {
            "main": [[
                {"node": "RSS HN", "type": "main", "index": 0},
                {"node": "RSS Google", "type": "main", "index": 0},
                {"node": "X Keyword Search", "type": "main", "index": 0},
                {"node": "X Account Search", "type": "main", "index": 0}
            ]]
        },
        "Trigger 8AM": {
            "main": [[
                {"node": "RSS HN", "type": "main", "index": 0},
                {"node": "RSS Google", "type": "main", "index": 0},
                {"node": "X Keyword Search", "type": "main", "index": 0},
                {"node": "X Account Search", "type": "main", "index": 0}
            ]]
        },
        "RSS HN": {
            "main": [[{"node": "Merge RSS", "type": "main", "index": 0}]]
        },
        "RSS Google": {
            "main": [[{"node": "Merge RSS", "type": "main", "index": 1}]]
        },
        "X Keyword Search": {
            "main": [[{"node": "Merge X", "type": "main", "index": 0}]]
        },
        "X Account Search": {
            "main": [[{"node": "Merge X", "type": "main", "index": 1}]]
        },
        "Merge RSS": {
            "main": [[{"node": "Merge All", "type": "main", "index": 0}]]
        },
        "Merge X": {
            "main": [[{"node": "Merge All", "type": "main", "index": 1}]]
        },
        "Merge All": {
            "main": [[{"node": "Normalize", "type": "main", "index": 0}]]
        },
        "Normalize": {
            "main": [[{"node": "Dedupe", "type": "main", "index": 0}]]
        },
        "Dedupe": {
            "main": [[{"node": "LLM Rank", "type": "main", "index": 0}]]
        },
        "LLM Rank": {
            "main": [[{"node": "Generate Tweets", "type": "main", "index": 0}]]
        },
        "Generate Tweets": {
            "main": [[{"node": "Send to Slack", "type": "main", "index": 0}]]
        }
    },
    "settings": {
        "executionOrder": "v1",
        "timezone": "Asia/Shanghai"
    },
    "staticData": None,
    "tags": [],
    "triggerCount": 1
}

# Write to file
print("Writing workflow to file...")
with open('/home/henry/x/workflows/daily-pack-final.json', 'w') as f:
    json.dump(workflow, f, indent=2)

print("✅ Complete workflow created: daily-pack-final.json")
print(f"📊 Total nodes: {len(workflow['nodes'])}")
print(f"🔗 Total connections: {len(workflow['connections'])}")
print("📡 Data sources: RSS HN, RSS Google, X Keywords, X Accounts")
print("🔧 FIXED: RSS nodes now use rssFeedRead for proper XML parsing")
