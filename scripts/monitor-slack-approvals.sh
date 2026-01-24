#!/bin/bash
# Monitor Slack Approvals workflow executions

API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlOTk5ODlmMS1iMDUwLTQwYTUtYWE2Yy00NDUwMjU0YWIwZmQiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzY4OTUxMzc0fQ.KQ7gd05MbFuRvEhJBgcZx_QibjfD8uCEUqfiDNEMWdI"
WORKFLOW_ID="jf8cXtS48FMGv3kP"

echo "📱 Slack Approvals 工作流监控"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⏰ 监控最近 5 分钟的执行记录..."
echo ""

while true; do
    # 获取最近的执行
    EXECUTIONS=$(curl -s -H "X-N8N-API-KEY: $API_KEY" \
      "http://localhost:5678/api/v1/executions?limit=5&workflowId=$WORKFLOW_ID")

    echo "[$(date '+%H:%M:%S')] 最近执行:"
    echo "$EXECUTIONS" | python3 -c "
import json, sys
from datetime import datetime

try:
    data = json.load(sys.stdin)
    if data.get('data'):
        for exec in data['data'][:3]:  # 显示最近 3 条
            exec_id = exec.get('id', 'N/A')
            status = exec.get('status', 'unknown')
            finished = '✅' if exec.get('finished') else '⏳'
            started = exec.get('startedAt', '')

            if started:
                dt = datetime.fromisoformat(started.replace('Z', '+00:00'))
                started = dt.strftime('%H:%M:%S')

            # 状态图标
            status_icon = '✅' if status == 'success' else '❌' if status == 'error' else '⏳'

            print(f\"  {status_icon} [{started}] {exec_id[:8]} - {status} {finished}\")
    else:
        print('  (暂无执行记录)')
except Exception as e:
    print(f'  Error: {e}')
"

    echo ""
    sleep 10
done
