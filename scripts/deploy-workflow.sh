#!/bin/bash
# 自动部署工作流到 n8n
# 用法: ./scripts/deploy-workflow.sh [workflow-file]

set -e

WORKFLOW_FILE="${1:-workflows/daily-pack-v5-fixed.json}"
CONTAINER_NAME="n8n-local"

echo "======================================"
echo "  n8n Workflow Deployer"
echo "======================================"
echo ""

# 检查文件存在
if [ ! -f "$WORKFLOW_FILE" ]; then
    echo "❌ Error: Workflow file not found: $WORKFLOW_FILE"
    exit 1
fi

# 检查容器运行
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "❌ Error: Container $CONTAINER_NAME is not running"
    echo "   Run: docker compose up -d"
    exit 1
fi

echo "📦 Deploying: $WORKFLOW_FILE"
echo ""

# 复制文件到容器
docker cp "$WORKFLOW_FILE" "${CONTAINER_NAME}:/tmp/workflow.json"

# 导入工作流
docker exec "$CONTAINER_NAME" n8n import:workflow --input=/tmp/workflow.json

# 清理临时文件
docker exec "$CONTAINER_NAME" rm -f /tmp/workflow.json

echo ""
echo "======================================"
echo "✅ Workflow deployed successfully!"
echo "======================================"
echo ""
echo "Next: Verify at http://localhost:5678"
