# 快速开始（最新流程）

## 1. 启动服务

```bash
cd /home/henry/x
docker compose up -d
docker compose ps
```

## 2. 导入工作流（首次）

- 打开 http://localhost:5678
- Import → `workflows/daily-pack-v5-fixed.json`
- Import → `workflows/slack-approvals.json`

## 3. 固化为标准运行顺序（强烈推荐）

```bash
npm run deploy
npm run drift-check
npm run probe
npm run trigger:webhook
```

## 4. 测试（可重复自动化）

```bash
npm test
npm run test:unit
```

## 详细文档（优先看 Runbook）

- `docs/RUNBOOK.md` - 生产运维 Runbook（最推荐）
- `CLAUDE.md` - 项目总结
- `docs/OPERATIONS.md` - 运维手册（已对齐 Runbook）
