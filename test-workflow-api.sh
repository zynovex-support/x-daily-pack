#!/bin/bash
# n8n Workflow Full Test Script

API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlOTk5ODlmMS1iMDUwLTQwYTUtYWE2Yy00NDUwMjU0YWIwZmQiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzY4OTUxMzc0fQ.KQ7gd05MbFuRvEhJBgcZx_QibjfD8uCEUqfiDNEMWdI"
BASE_URL="http://localhost:5678/api/v1"

echo "========== n8n Workflow Test =========="
echo "Time: $(date)"
echo ""

# List workflows
echo "=== Available Workflows ==="
curl -s -H "X-N8N-API-KEY: $API_KEY" "$BASE_URL/workflows" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for w in data.get('data', []):
    print(f\"  {w['id']} | {w['name']} | active={w['active']}\")
"

# Find X Daily Pack workflow (Complete with X Integration)
echo ""
echo "=== Finding Target Workflow ==="
WORKFLOW_ID=$(curl -s -H "X-N8N-API-KEY: $API_KEY" "$BASE_URL/workflows" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for w in data.get('data', []):
    if 'Complete with X Integration' in w.get('name', ''):
        print(w['id'])
        break
")
echo "Target Workflow ID: $WORKFLOW_ID"

if [ -z "$WORKFLOW_ID" ]; then
    echo "ERROR: Workflow not found!"
    exit 1
fi

# Execute workflow
echo ""
echo "=== Executing Workflow ==="
EXEC_RESULT=$(curl -s -X POST -H "X-N8N-API-KEY: $API_KEY" -H "Content-Type: application/json" "$BASE_URL/workflows/$WORKFLOW_ID/run" -d '{}')
echo "Execution started: $EXEC_RESULT"

# Get execution ID from result
EXEC_ID=$(echo "$EXEC_RESULT" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print(data.get('data', {}).get('executionId', data.get('executionId', '')))
except:
    pass
")
echo "Execution ID: $EXEC_ID"

# Poll for execution status
echo ""
echo "=== Waiting for Execution ==="
for i in {1..60}; do
    sleep 3

    EXEC_STATUS=$(curl -s -H "X-N8N-API-KEY: $API_KEY" "$BASE_URL/executions/$EXEC_ID")

    STATUS=$(echo "$EXEC_STATUS" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    d = data.get('data', data)
    print(f\"{d.get('status', 'unknown')}|{d.get('finished', False)}\")
except Exception as e:
    print(f'error|{e}')
")

    FINISHED=$(echo "$STATUS" | cut -d'|' -f2)
    STATUS_TEXT=$(echo "$STATUS" | cut -d'|' -f1)

    echo "[$(date +%H:%M:%S)] Status: $STATUS_TEXT, Finished: $FINISHED"

    if [ "$FINISHED" = "True" ] || [ "$FINISHED" = "true" ]; then
        break
    fi
done

# Get final execution details
echo ""
echo "=== Execution Result ==="
curl -s -H "X-N8N-API-KEY: $API_KEY" "$BASE_URL/executions/$EXEC_ID" | python3 -c "
import json, sys
data = json.load(sys.stdin)
d = data.get('data', data)
print(f\"Status: {d.get('status')}\")
print(f\"Started: {d.get('startedAt')}\")
print(f\"Finished: {d.get('stoppedAt')}\")
print(f\"Mode: {d.get('mode')}\")

# Calculate duration
if d.get('startedAt') and d.get('stoppedAt'):
    from datetime import datetime
    try:
        start = datetime.fromisoformat(d['startedAt'].replace('Z', '+00:00'))
        stop = datetime.fromisoformat(d['stoppedAt'].replace('Z', '+00:00'))
        duration = (stop - start).total_seconds()
        print(f\"Duration: {duration:.1f} seconds\")
    except:
        pass

# Node results
run_data = d.get('data', {}).get('resultData', {}).get('runData', {})
if run_data:
    print()
    print('=== Node Results ===')
    for node_name, node_data in run_data.items():
        if node_data:
            last_run = node_data[-1]
            items = last_run.get('data', {}).get('main', [[]])[0]
            item_count = len(items) if items else 0
            error = last_run.get('error')
            status = 'ERROR' if error else 'OK'
            error_msg = f\" - {error.get('message', error)}\" if error else ''
            print(f\"  [{status}] {node_name}: {item_count} items{error_msg}\")

# Check for execution error
error = d.get('data', {}).get('resultData', {}).get('error')
if error:
    print()
    print('=== EXECUTION ERROR ===')
    print(json.dumps(error, indent=2))
" 2>&1

# Save full result to file
echo ""
echo "=== Saving Full Result ==="
curl -s -H "X-N8N-API-KEY: $API_KEY" "$BASE_URL/executions/$EXEC_ID" > /home/henry/x/execution-result.json
echo "Saved to execution-result.json"

echo ""
echo "========== Test Complete =========="
