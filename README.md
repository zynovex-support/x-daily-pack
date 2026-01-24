# X Daily Pack

AI 行业日报自动化系统 - 自动采集、去重、评分、推送内容到 Slack/Telegram，审批后发布到 X/Twitter。

[![Test Suite](https://github.com/zynovex-support/x-daily-pack/actions/workflows/test.yml/badge.svg)](https://github.com/zynovex-support/x-daily-pack/actions/workflows/test.yml)

## 功能特性

- **多源采集**: 34个RSS源 + 6个新闻API + X/Twitter搜索
- **智能去重**: URL去重 + 语义去重（Embedding余弦相似度）
- **事件聚类**: DBSCAN算法自动聚合相关新闻
- **LLM评分**: 4维度评分（时效性、影响力、可行动性、相关性）
- **推文生成**: 人性化风格，自动生成3种角度的推文
- **审批流程**: Slack/Telegram推送，支持反馈学习

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

### 3. 启动 n8n

```bash
docker-compose up -d
```

### 4. 运行测试

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
| `RUBE_AUTH_TOKEN` | ✅ | Rube MCP认证Token |
| `NEWS_API_KEY` | | NewsAPI密钥 |
| `GNEWS_API_KEY` | | GNews密钥 |

完整环境变量列表见 `.env.example`

## 项目结构

```
├── workflows/          # n8n工作流JSON
├── scripts/            # 节点脚本代码
├── config/             # RSS源、查询配置
├── tests/              # 测试套件 (Vitest)
├── docs/               # 详细文档
└── .github/workflows/  # CI/CD配置
```

## 文档

| 文档 | 说明 |
|------|------|
| [CLAUDE.md](CLAUDE.md) | 项目总结 |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | 运维手册 |
| [docs/WORKFLOWS.md](docs/WORKFLOWS.md) | 工作流详解 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 系统架构 |

## License

MIT
