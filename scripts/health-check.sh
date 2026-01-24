#!/bin/bash
# 服务健康检查脚本
# 用法: ./scripts/health-check.sh [--fix]
# 可配合 cron 定时执行

set -e

FIX_MODE="${1:-}"
COMPOSE_DIR="/home/henry/x"

check_service() {
    local name=$1
    local url=$2

    if curl -s --max-time 5 "$url" > /dev/null 2>&1; then
        echo "✅ $name: healthy"
        return 0
    else
        echo "❌ $name: unhealthy"
        return 1
    fi
}

echo "======================================"
echo "  X Daily Pack - Health Check"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================"
echo ""

# 检查 Docker
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker: not running"
    exit 1
fi
echo "✅ Docker: running"

# 检查容器状态
cd "$COMPOSE_DIR"
UNHEALTHY=0

if ! docker compose ps --format json 2>/dev/null | grep -q "config-server"; then
    echo "❌ config-server: not running"
    UNHEALTHY=1
else
    check_service "config-server" "http://localhost:3001/health" || UNHEALTHY=1
fi

if ! docker compose ps --format json 2>/dev/null | grep -q "n8n-local"; then
    echo "❌ n8n: not running"
    UNHEALTHY=1
else
    check_service "n8n" "http://localhost:5678/healthz" || UNHEALTHY=1
fi

echo ""

# 自动修复
if [ "$UNHEALTHY" -eq 1 ] && [ "$FIX_MODE" = "--fix" ]; then
    echo "🔧 Attempting auto-fix..."
    docker compose up -d
    sleep 10
    echo "🔄 Rechecking..."
    check_service "config-server" "http://localhost:3001/health"
    check_service "n8n" "http://localhost:5678/healthz"
fi

# 返回状态码
if [ "$UNHEALTHY" -eq 1 ]; then
    echo "⚠️  Some services are unhealthy"
    exit 1
else
    echo "✅ All services healthy"
    exit 0
fi
