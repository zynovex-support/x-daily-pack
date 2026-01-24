#!/usr/bin/env python3
import json

# Read node code files
with open('/home/henry/x/scripts/llm-rank-node.js', 'r') as f:
    llm_rank_code = f.read()

with open('/home/henry/x/scripts/tweet-gen-node.js', 'r') as f:
    tweet_gen_code = f.read()

with open('/home/henry/x/scripts/slack-output-node.js', 'r') as f:
    slack_output_code = f.read()

# Build complete workflow
workflow = {
    "name": "X Daily Pack - Complete",
    "nodes": [
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
        {
            "parameters": {
                "url": "https://hnrss.org/best?count=15",
                "options": {}
            },
            "name": "RSS HN",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [440, 200],
            "id": "rss-hn"
        },
        {
            "parameters": {
                "url": "https://news.google.com/rss/search?q=AI+OR+artificial+intelligence&hl=en",
                "options": {}
            },
            "name": "RSS Google",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [440, 300],
            "id": "rss-google"
        },
        {
            "parameters": {
                "mode": "combine",
                "combinationMode": "multiplex"
            },
            "name": "Merge All",
            "type": "n8n-nodes-base.merge",
            "typeVersion": 2.1,
            "position": [640, 250],
            "id": "merge"
        },
        {
            "parameters": {
                "jsCode": "// Normalize all data\nconst items = $input.all();\nconst normalized = [];\n\nfor (const item of items) {\n  const data = item.json;\n  normalized.push({\n    title: data.title || data.text || '',\n    url: data.link || data.url || '',\n    source: data.source || 'RSS',\n    snippet: (data.description || data.summary || data.text || '').substring(0, 300),\n    publishedAt: data.pubDate || data.created_at || new Date().toISOString()\n  });\n}\n\nreturn normalized.map(item => ({ json: item }));"
            },
            "name": "Normalize",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [840, 250],
            "id": "normalize"
        },
        {
            "parameters": {
                "jsCode": "// Simple dedupe by URL\nconst items = $input.all();\nconst seen = new Set();\nconst unique = [];\n\nfor (const item of items) {\n  const url = item.json.url;\n  if (url && !seen.has(url)) {\n    seen.add(url);\n    unique.push(item);\n  }\n}\n\nreturn unique;"
            },
            "name": "Dedupe",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1040, 250],
            "id": "dedupe"
        },
        {
            "parameters": {
                "jsCode": llm_rank_code
            },
            "name": "LLM Rank",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1240, 250],
            "id": "llm-rank"
        },
        {
            "parameters": {
                "jsCode": tweet_gen_code
            },
            "name": "Generate Tweets",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1440, 250],
            "id": "tweet-gen"
        },
        {
            "parameters": {
                "jsCode": slack_output_code
            },
            "name": "Send to Slack",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1640, 250],
            "id": "slack-output"
        }
    ],
    "connections": {
        "Trigger 8AM": {
            "main": [[
                {"node": "RSS HN", "type": "main", "index": 0},
                {"node": "RSS Google", "type": "main", "index": 0}
            ]]
        },
        "RSS HN": {
            "main": [[{"node": "Merge All", "type": "main", "index": 0}]]
        },
        "RSS Google": {
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
    "settings": {"executionOrder": "v1"},
    "staticData": None,
    "tags": [],
    "triggerCount": 1
}

# Write to file
with open('/home/henry/x/workflows/daily-pack-final.json', 'w') as f:
    json.dump(workflow, f, indent=2)

print("✅ Complete workflow created: daily-pack-final.json")
print(f"📊 Total nodes: {len(workflow['nodes'])}")
print(f"🔗 Total connections: {len(workflow['connections'])}")
