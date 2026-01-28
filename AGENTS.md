# X Daily Pack

AI 行业日报自动化系统 - 采集、去重、评分、推送到 Slack/Telegram，审批后发布到 X/Twitter。

**仓库**: https://github.com/zynovex-support/x-daily-pack
**版本**: v5-fixed
**状态**: Phase 1-4 全部完成 + 安全加固

## 技术栈

- **工作流**: n8n (Docker 自托管, port 5678)
- **LLM**: OpenAI gpt-4o-mini
- **Embedding**: text-embedding-3-small
- **AI增强**: LangChain (质量守门 + RAG)
- **数据源**: 34 RSS + 6 News API + X/Twitter
- **监控**: Prometheus + Grafana
- **测试**: Vitest + MSW + Promptfoo
- **CI/CD**: GitHub Actions + Snyk + Semgrep

## 核心文件

```
workflows/
├── daily-pack-v5-fixed.json    # 主流程 (18节点)
└── slack-approvals.json        # 审批流程 (4节点)

scripts/
├── event-clustering-node.js    # DBSCAN聚类
├── semantic-dedupe-node.js     # 语义去重
├── llm-rank-node.js            # 4维度评分
├── feedback-learning.js        # 反馈学习
├── ai-quality-gate.js          # AI质量守门 ⭐ Phase 4
├── rag-enhanced-rank.js        # RAG增强评分 ⭐ Phase 4
├── metrics-collector.js        # 指标收集 ⭐ Phase 4
├── config-server.js            # 配置服务 (API Key认证)
├── deploy_daily_pack.py        # 同步代码节点与调度 ⭐
├── drift_check_daily_pack.py   # 漂移检测（cron + 代码节点）⭐
├── probe_daily_pack.py         # 健康探针 ⭐
├── probe_daily_pack_notify.py  # 巡检告警（去重+冷却）⭐
└── trigger_daily_pack.py       # 手工触发 + 验证 ⭐

monitoring/
├── docker-compose.yml          # Prometheus + Grafana
├── prometheus.yml              # 抓取配置
└── alerts.yml                  # 告警规则

config/
├── rss-feeds.json              # RSS源配置
└── x-queries.json              # X查询配置
```

## 常用命令

```bash
# 测试
npm test              # 运行所有测试
npm run test:unit     # 单元测试
npm run test:coverage # 覆盖率报告

# n8n
docker compose up -d  # 启动
docker compose down   # 停止
docker compose restart n8n

# Runbook（强烈推荐固定顺序）
npm run deploy
npm run drift-check
npm run probe
npm run trigger:webhook
npm run probe:notify

# 监控
cd monitoring && docker compose up -d  # 启动监控
cd monitoring && docker compose down   # 停止监控
```

## 关键参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 语义去重阈值 | 0.85 | 余弦相似度 |
| 聚类 eps | 0.25 | DBSCAN距离 |
| 评分阈值 | 18/30 | 最低通过分 |
| 调度时间 | UTC 0h/12h | 每日两次 |

## 硬性要求

1. 生产版本: `workflows/daily-pack-v5-fixed.json`
2. 测试验证必须通过 API/日志，禁止截图
3. 所有测试必须可重复自动化
4. Webhook 必须配置 Header Auth 认证
5. Config Server 必须配置 API Key 认证
6. `N8N_BLOCK_ENV_ACCESS_IN_NODE=true` 必须启用

> 现状说明（2026-01-27）: 生产仍为 `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`（$env 依赖较多），属于已知风险与迁移未完成项；运维以 `docs/RUNBOOK.md` 为准。

## 安全配置

| 配置 | 说明 |
|------|------|
| WEBHOOK_SECRET | Webhook Header Auth 密钥 |
| CONFIG_API_KEY | Config Server API 密钥 |
| ALLOWED_ORIGINS | CORS 白名单域名 |
| N8N_BLOCK_ENV_ACCESS_IN_NODE | 禁止节点访问环境变量 |

## 监控端点

| 服务 | 地址 | 说明 |
|------|------|------|
| n8n | http://localhost:5678 | 工作流引擎 |
| Prometheus | http://localhost:9090 | 指标收集 |
| Grafana | http://localhost:3000 | 可视化 |

## 文档

- [CLAUDE.md](CLAUDE.md) - 项目总结
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - 系统架构
- [docs/SECURITY.md](docs/SECURITY.md) - 安全指南
- [docs/MONITORING.md](docs/MONITORING.md) - 监控指南
