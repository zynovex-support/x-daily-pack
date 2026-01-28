# X Daily Pack

AI 行业日报自动化系统 - 自动采集、去重、评分、推送内容到 Slack/Telegram，审批后发布到 X/Twitter。

[![Test Suite](https://github.com/zynovex-support/x-daily-pack/actions/workflows/test.yml/badge.svg)](https://github.com/zynovex-support/x-daily-pack/actions/workflows/test.yml)

## 功能特性

### 数据采集
- **多源采集**: 34个RSS源 + 6个新闻API + X/Twitter搜索

### 内容处理
- **智能去重**: URL去重 + 语义去重（Embedding余弦相似度 0.85）
- **事件聚类**: DBSCAN算法自动聚合相关新闻
- **LLM评分**: 4维度评分（时效性、影响力、可行动性、相关性）
- **AI质量守门**: LangChain 驱动的内容质量检查
- **RAG增强**: 历史数据增强评分

### 输出推送
- **推文生成**: 人性化风格，自动生成3种角度的推文
- **审批流程**: Slack/Telegram推送，支持反馈学习

### 安全与监控
- **认证保护**: Webhook Header Auth + API Key
- **监控告警**: Prometheus + Grafana 全链路监控

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填入你的API密钥
```

### 3. 启动服务 (n8n + config-server)

```bash
docker compose up -d
```

### 4. 标准运维操作 (推荐固定顺序)

```bash
npm run deploy        # 同步代码节点与调度到 live n8n
npm run drift-check   # 检查调度与代码节点漂移
npm run probe         # 探针：调度/成功率/Slack命中
npm run trigger:webhook
```

### 5. 运行测试

```bash
npm test              # 运行所有测试
npm run test:unit     # 仅单元测试
npm run test:coverage # 带覆盖率报告
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `OPENAI_API_KEY` | ✅ | OpenAI API密钥 |
| `SLACK_BOT_TOKEN` | ✅ | Slack Bot Token |
| `SLACK_CHANNEL_ID` | ✅ | Slack频道ID |
| `WEBHOOK_SECRET` | ✅ | Webhook认证密钥 |
| `CONFIG_API_KEY` | ✅ | Config Server API密钥 |
| `N8N_API_KEY` | ✅ | n8n API Key（用于 deploy/probe/drift-check） |
| `TELEGRAM_DAILY_BOT_TOKEN` | | Telegram Bot Token |
| `TELEGRAM_DAILY_CHAT_ID` | | Telegram Chat ID |
| `NEWS_API_KEY` | | NewsAPI密钥 |
| `GNEWS_API_KEY` | | GNews密钥 |
| `NEWS_API_MAX_APIS_PER_RUN` | | 强降级：限制单次运行 API 数量 |
| `NEWS_API_OVERALL_BUDGET_MS` | | 强降级：限制单次运行总时长预算（ms） |

完整环境变量列表见 `.env.example`

## 项目结构

```
├── workflows/          # n8n工作流JSON
├── scripts/            # 节点脚本代码
├── config/             # RSS源、查询配置
├── monitoring/         # Prometheus + Grafana 配置
├── tests/              # 测试套件 (Vitest)
├── docs/               # 详细文档
└── .github/workflows/  # CI/CD配置
```

## 文档

| 文档 | 说明 |
|------|------|
| [CLAUDE.md](CLAUDE.md) | 项目总结 |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | 生产运维 Runbook（最推荐） |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 系统架构 |
| [docs/SECURITY.md](docs/SECURITY.md) | 安全指南 |
| [docs/MONITORING.md](docs/MONITORING.md) | 监控指南 |

## License

MIT
