# X Daily Pack - AI 内容策展系统

自动化收集/筛选 AI 资讯，生成推文草稿，通过 Slack 审批后发往 X。

**项目状态**: ✅ Phase 1-3 全部完成
**版本**: v5-fixed (18节点主流程 + 4节点审批流程)

## 快速部署

```bash
# 启动 n8n
docker run -d --name n8n-local -p 5678:5678 \
  -v $HOME/.n8n:/home/node/.n8n \
  --env-file /home/henry/x/.env \
  --restart=always \
  n8nio/n8n:latest

# 运行测试
node tests/run-all.js
```

## 文档

| 文档 | 说明 |
|------|------|
| `CLAUDE.md` | 项目总结 |
| `docs/OPERATIONS.md` | 运维手册 |
| `docs/WORKFLOWS.md` | 工作流详解 |

---

**最后更新**: 2026-01-24
