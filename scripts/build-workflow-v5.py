#!/usr/bin/env python3
"""
Build X Daily Pack Workflow v5 - with Semantic Deduplication

Changes from v4:
- Added Semantic Dedupe node between URL Dedupe and LLM Rank
- Uses OpenAI Embedding for semantic similarity detection
- Can identify "different URLs but same topic" duplicates

Flow:
Trigger → RSS + X → Merge → Normalize → URL Dedupe → Semantic Dedupe → LLM Rank → Tweet Gen → Slack + Telegram
"""

import json
import os

BASE_DIR = '/home/henry/x'

# Read all node code files
print("Reading node code files...")

def read_file(path):
    with open(os.path.join(BASE_DIR, path), 'r') as f:
        return f.read()

llm_rank_code = read_file('scripts/llm-rank-node.js')
tweet_gen_code = read_file('scripts/tweet-gen-node.js')
slack_output_code = read_file('scripts/slack-output-node.js')
telegram_output_code = read_file('scripts/telegram-output-node.js')
x_keyword_code = read_file('scripts/x-keyword-search-node.js')
x_account_code = read_file('scripts/x-account-search-node.js')
cross_day_dedupe_code = read_file('scripts/cross-day-dedupe-node.js')
semantic_dedupe_code = read_file('scripts/semantic-dedupe-node.js')

print("Building workflow structure with Semantic Dedupe...")

# Normalize code
normalize_code = """// Normalize all data sources to common format
const items = $input.all();
const normalized = [];

for (const item of items) {
  const data = item.json;
  if (!data) continue;

  const title = data.title || data.text || '';
  const url = data.link || data.url || '';
  const source = data.source || 'RSS';
  const snippet = (data.description || data.summary || data.text || data.snippet || '').substring(0, 300);
  const publishedAt = data.pubDate || data.created_at || data.publishedAt || data.isoDate || new Date().toISOString();

  if (!title && !url) continue;

  const metrics = data.metrics || data.public_metrics || {};
  const sourceType = data.sourceType || (source.startsWith('X -') ? 'X' : 'RSS');

  normalized.push({
    title, url, source, sourceType, snippet, publishedAt, metrics
  });
}

console.log('Normalize: ' + items.length + ' -> ' + normalized.length + ' items');
return normalized.map(item => ({ json: item }));"""

# Build workflow
workflow = {
    "name": "X Daily Pack v5 - Semantic Dedupe",
    "nodes": [
        {
            "parameters": {},
            "name": "Manual Trigger",
            "type": "n8n-nodes-base.manualTrigger",
            "typeVersion": 1,
            "position": [120, 300],
            "id": "manual-trigger"
        },
        {
            "parameters": {
                "rule": {"interval": [{"field": "cronExpression", "expression": "0 8 * * *"}]}
            },
            "name": "Trigger 8AM",
            "type": "n8n-nodes-base.scheduleTrigger",
            "typeVersion": 1.1,
            "position": [240, 300],
            "id": "trigger"
        },
        {
            "parameters": {"url": "https://hnrss.org/best?count=15", "options": {}},
            "name": "RSS HN",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [440, 100],
            "id": "rss-hn"
        },
        {
            "parameters": {"url": "https://news.google.com/rss/search?q=AI+OR+artificial+intelligence&hl=en", "options": {}},
            "name": "RSS Google",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [440, 200],
            "id": "rss-google"
        },
        {
            "parameters": {"jsCode": x_keyword_code},
            "name": "X Keyword Search",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [440, 400],
            "id": "x-keyword"
        },
        {
            "parameters": {"jsCode": x_account_code},
            "name": "X Account Search",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [440, 500],
            "id": "x-account"
        },
        {
            "parameters": {"mode": "combine", "combinationMode": "multiplex"},
            "name": "Merge All",
            "type": "n8n-nodes-base.merge",
            "typeVersion": 2.1,
            "position": [740, 300],
            "id": "merge"
        },
        {
            "parameters": {"jsCode": normalize_code},
            "name": "Normalize",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [940, 300],
            "id": "normalize"
        },
        {
            "parameters": {"jsCode": cross_day_dedupe_code},
            "name": "URL Dedupe",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1140, 300],
            "id": "url-dedupe"
        },
        {
            "parameters": {"jsCode": semantic_dedupe_code},
            "name": "Semantic Dedupe",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1340, 300],
            "id": "semantic-dedupe"
        },
        {
            "parameters": {"jsCode": llm_rank_code},
            "name": "LLM Rank",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1540, 300],
            "id": "llm-rank"
        },
        {
            "parameters": {"jsCode": tweet_gen_code},
            "name": "Generate Tweets",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1740, 300],
            "id": "tweet-gen"
        },
        {
            "parameters": {"jsCode": slack_output_code},
            "name": "Send to Slack",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1940, 200],
            "id": "slack-output"
        },
        {
            "parameters": {"jsCode": telegram_output_code},
            "name": "Send to Telegram",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1940, 400],
            "id": "telegram-output"
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
        "RSS HN": {"main": [[{"node": "Merge All", "type": "main", "index": 0}]]},
        "RSS Google": {"main": [[{"node": "Merge All", "type": "main", "index": 1}]]},
        "X Keyword Search": {"main": [[{"node": "Merge All", "type": "main", "index": 2}]]},
        "X Account Search": {"main": [[{"node": "Merge All", "type": "main", "index": 3}]]},
        "Merge All": {"main": [[{"node": "Normalize", "type": "main", "index": 0}]]},
        "Normalize": {"main": [[{"node": "URL Dedupe", "type": "main", "index": 0}]]},
        "URL Dedupe": {"main": [[{"node": "Semantic Dedupe", "type": "main", "index": 0}]]},
        "Semantic Dedupe": {"main": [[{"node": "LLM Rank", "type": "main", "index": 0}]]},
        "LLM Rank": {"main": [[{"node": "Generate Tweets", "type": "main", "index": 0}]]},
        "Generate Tweets": {
            "main": [[
                {"node": "Send to Slack", "type": "main", "index": 0},
                {"node": "Send to Telegram", "type": "main", "index": 0}
            ]]
        }
    },
    "settings": {"executionOrder": "v1"},
    "staticData": None,
    "tags": [],
    "triggerCount": 1
}

# Write to file
output_path = os.path.join(BASE_DIR, 'workflows/daily-pack-v5.json')
with open(output_path, 'w') as f:
    json.dump(workflow, f, indent=2)

print("")
print("=" * 50)
print("✅ Workflow v5 created: workflows/daily-pack-v5.json")
print("=" * 50)
print(f"📊 Total nodes: {len(workflow['nodes'])}")
print("")
print("🔧 Processing pipeline:")
print("   1. Normalize - 统一数据格式")
print("   2. URL Dedupe - URL去重（跨日，7天）")
print("   3. Semantic Dedupe - 语义去重（新增！）⭐")
print("   4. LLM Rank - AI评分排序")
print("   5. Generate Tweets - 生成推文")
print("   6. Send to Slack + Telegram - 推送")
print("")
print("🆕 New in v5:")
print("   - Semantic Deduplication using OpenAI Embeddings")
print("   - Detects 'different URL but same topic' duplicates")
print("   - Configurable threshold: SEMANTIC_DEDUPE_THRESHOLD=0.85")
