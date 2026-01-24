#!/usr/bin/env python3
"""
Add News API node to the workflow
"""
import json
import sys

# Read the news-api-fetch-node.js code
with open('/home/henry/x/scripts/news-api-fetch-node.js', 'r') as f:
    news_api_code = f.read()

# Read the workflow
with open('/home/henry/x/workflows/daily-pack-v5-fixed.json', 'r') as f:
    workflow = json.load(f)

# Check if News API node already exists
existing_nodes = [n['name'] for n in workflow['nodes']]
if 'News API Fetch' in existing_nodes:
    print("News API Fetch node already exists, skipping")
    sys.exit(0)

# Add News API Fetch node
news_api_node = {
    "parameters": {
        "jsCode": news_api_code
    },
    "name": "News API Fetch",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [440, 100],  # Above RSS Fetch All
    "id": "news-api-fetch"
}
workflow['nodes'].append(news_api_node)

# Add Merge RSS+News node
merge_rss_news_node = {
    "parameters": {
        "mode": "append"
    },
    "name": "Merge RSS+News",
    "type": "n8n-nodes-base.merge",
    "typeVersion": 2.1,
    "position": [700, 150],
    "id": "merge-rss-news"
}
workflow['nodes'].append(merge_rss_news_node)

# Update connections
connections = workflow['connections']

# Add News API Fetch to triggers
for trigger in ['Manual Trigger', 'Trigger UTC 0h 12h']:
    if trigger in connections:
        connections[trigger]['main'][0].append({
            "node": "News API Fetch",
            "type": "main",
            "index": 0
        })

# News API Fetch -> Merge RSS+News (index 0)
connections['News API Fetch'] = {
    "main": [[{
        "node": "Merge RSS+News",
        "type": "main",
        "index": 0
    }]]
}

# RSS Fetch All -> Merge RSS+News (index 1) instead of Merge All
connections['RSS Fetch All'] = {
    "main": [[{
        "node": "Merge RSS+News",
        "type": "main",
        "index": 1
    }]]
}

# Merge RSS+News -> Merge All (index 0)
connections['Merge RSS+News'] = {
    "main": [[{
        "node": "Merge All",
        "type": "main",
        "index": 0
    }]]
}

# Save the updated workflow
with open('/home/henry/x/workflows/daily-pack-v5-fixed.json', 'w') as f:
    json.dump(workflow, f, indent=2)

print("Successfully added News API Fetch node to workflow")
print("New nodes: News API Fetch, Merge RSS+News")
print("Total nodes:", len(workflow['nodes']))
