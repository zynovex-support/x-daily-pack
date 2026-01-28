#!/bin/bash
# Quick update script for n8n workflows
set -e

API_KEY="${N8N_API_KEY:-}"
N8N_URL="${N8N_URL:-http://localhost:5678}"

if [ -z "$API_KEY" ]; then
  echo "❌ Missing N8N_API_KEY. Export it before running."
  exit 1
fi

echo "======================================"
echo "n8n Workflow Updater"
echo "======================================"
echo ""

# Get all workflows
echo "📋 Fetching workflows..."
WORKFLOWS=$(curl -s -H "X-N8N-API-KEY: $API_KEY" "$N8N_URL/api/v1/workflows")

# Find workflow IDs by name
DAILY_PACK_ID=$(echo "$WORKFLOWS" | jq -r '.data[] | select(.name | contains("v3")) | .id' | head -1)
SLACK_APPROVALS_ID=$(echo "$WORKFLOWS" | jq -r '.data[] | select(.name | contains("Slack Approvals")) | .id' | head -1)

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
echo "  2. Tweet URL in success messages"
echo ""
echo "Next steps:"
echo "  - Test with: export X_WRITE_ENABLED=false"
echo "  - Trigger Daily Pack and check Slack message"
echo "  - Reply with 'post 1' to test publishing"
