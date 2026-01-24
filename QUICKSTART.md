# 快速开始

## 3步部署

### 1. 启动 n8n
```bash
docker run -d --name n8n-local -p 5678:5678 \
  -v $HOME/.n8n:/home/node/.n8n \
  --env-file /home/henry/x/.env \
  --restart=always \
  n8nio/n8n:latest
```

### 2. 导入工作流
- 打开 http://localhost:5678
- Import → `workflows/daily-pack-v5-fixed.json`
- Import → `workflows/slack-approvals.json`

### 3. 验证
```bash
node tests/run-all.js
```

## 详细文档
- `CLAUDE.md` - 项目总结
- `docs/OPERATIONS.md` - 运维手册
