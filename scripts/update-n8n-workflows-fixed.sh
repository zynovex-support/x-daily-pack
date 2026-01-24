#!/bin/bash
# Quick update script for n8n workflows
set -e

# Use the correct API key from test-workflow-api.sh
API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlOTk5ODlmMS1iMDUwLTQwYTUtYWE2Yy00NDUwMjU0YWIwZmQiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzY4OTUxMzc0fQ.KQ7gd05MbFuRvEhJBgcZx_QibjfD8uCEUqfiDNEMWdI"
N8N_URL="${N8N_URL:-http://localhost:5678}"

echo "======================================"
echo "n8n Workflow Updater"
echo "======================================"
echo ""

# Get all workflows
echo "📋 Fetching workflows..."
WORKFLOWS=$(curl -s -H "X-N8N-API-KEY: $API_KEY" "$N8N_URL/api/v1/workflows")

# Find workflow IDs by name
DAILY_PACK_ID=$(echo "$WORKFLOWS" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for w in data.get('data', []):
    if 'v3' in w.get('name', ''):
        print(w['id'])
        break
")

SLACK_APPROVALS_ID=$(echo "$WORKFLOWS" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for w in data.get('data', []):
    if 'Slack Approvals' in w.get('name', ''):
        print(w['id'])
        break
")

echo "Found workflows:"
echo "  Daily Pack v3: $DAILY_PACK_ID"
echo "  Slack Approvals: $SLACK_APPROVALS_ID"
echo ""

if [ -z "$DAILY_PACK_ID" ] || [ -z "$SLACK_APPROVALS_ID" ]; then
    echo "❌ Error: Could not find one or both workflows"
    exit 1
fi

# Update workflows
echo "🔄 Updating daily-pack-v3..."
curl -s -X PUT \
    -H "X-N8N-API-KEY: $API_KEY" \
    -H "Content-Type: application/json" \
    -d @workflows/daily-pack-v3.json \
    "$N8N_URL/api/v1/workflows/$DAILY_PACK_ID" > /dev/null

if [ $? -eq 0 ]; then
    echo "✅ daily-pack-v3 updated"
else
    echo "❌ Failed to update daily-pack-v3"
    exit 1
fi

echo "🔄 Updating slack-approvals..."
curl -s -X PUT \
    -H "X-N8N-API-KEY: $API_KEY" \
    -H "Content-Type: application/json" \
    -d @workflows/slack-approvals.json \
    "$N8N_URL/api/v1/workflows/$SLACK_APPROVALS_ID" > /dev/null

if [ $? -eq 0 ]; then
    echo "✅ slack-approvals updated"
else
    echo "❌ Failed to update slack-approvals"
    exit 1
fi

echo ""
echo "======================================"
echo "✅ All workflows updated successfully!"
echo "======================================"
echo ""
echo "Changes applied:"
echo "  1. Dynamic mode status in Daily Pack messages"
echo "     - 🔴 DRY-RUN mode (X_WRITE_ENABLED=false)"
echo "     - 🟢 Real posting mode (X_WRITE_ENABLED=true)"
echo ""
echo "  2. Tweet URL in success messages"
echo "     - Shows: 🔗 查看推文: https://x.com/i/web/status/{id}"
echo ""
echo "Next steps:"
echo "  - Test with: Trigger Daily Pack workflow"
echo "  - Check Slack message for mode status"
echo "  - Reply with 'post 1' to test publishing"
