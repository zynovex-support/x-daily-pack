# X Daily Pack - 系统架构文档

**版本**: v5-fixed
**最后更新**: 2026-01-27
**状态**: Phase 1-4 完成 + Runbook/Probe/Drift-Check 已固化

---

## 一、项目愿景

**X Daily Pack** 是一个 AI 驱动的行业日报自动化系统，目标是：

1. **自动采集** - 从 40+ 数据源（RSS、News API、X/Twitter）采集 AI 行业资讯
2. **智能去重** - URL 去重 + 语义去重，消除重复内容
3. **AI 评分** - 多维度 LLM 评分，筛选高价值内容
4. **智能推送** - 自动推送到 Slack/Telegram，支持人工审批后发布到 X

---

## 二、系统架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        X Daily Pack v5                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │   RSS 源    │  │  News API   │  │  X/Twitter  │                 │
│  │  (34个源)   │  │  (6个API)   │  │ (7词+15号)  │                 │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │
│         │                │                │                         │
│         └────────────────┼────────────────┘                         │
│                          ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    数据处理管道                              │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │   │
│  │  │ 标准化  │→ │URL去重  │→ │语义去重 │→ │  事件聚类      │ │   │
│  │  │Normalize│  │CrossDay │  │Semantic │  │  Clustering    │ │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                          ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    AI 处理层                                 │   │
│  │  ┌─────────┐  ┌─────────────┐  ┌─────────────────────────┐  │   │
│  │  │LLM评分  │→ │ AI质量守门  │→ │    RAG增强评分          │  │   │
│  │  │4维度    │  │ Quality Gate│  │    (历史数据增强)       │  │   │
│  │  └─────────┘  └─────────────┘  └─────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                          ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    输出层                                    │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │   │
│  │  │推文生成 │→ │  Slack  │→ │Telegram │→ │  X/Twitter      │ │   │
│  │  │3角度   │  │  推送   │  │  推送   │  │  (审批后发布)   │ │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 三、核心工作流

### 3.1 主工作流 (daily-pack-v5-fixed.json)

**节点数**: 18 个
**触发方式**: UTC 0:00 / 12:00 定时 + Webhook + 手动

| # | 节点名称 | 类型 | 功能 |
|---|----------|------|------|
| 1 | Trigger UTC 0h 12h | Schedule | 定时触发 (UTC) |
| 2 | Manual Trigger | Manual | 手动触发 |
| 3 | Webhook Trigger | Webhook | HTTP 触发 (需认证) |
| 4 | Multi News API | Code | 6个新闻API并行采集 |
| 5 | RSS Fetch All | Code | 34个RSS源采集 |
| 6 | X Keyword Search | Code | 7个关键词搜索 |
| 7 | X Account Search | Code | 15个账号搜索 |
| 8 | Merge RSS+News | Merge | 合并RSS和新闻 |
| 9 | Merge X | Merge | 合并X搜索结果 |
| 10 | Merge All | Merge | 合并所有数据 |
| 11 | Normalize | Code | 数据标准化 |
| 12 | Cross-Day Dedupe | Code | URL跨天去重 |
| 13 | Semantic Dedupe | Code | 语义去重 (余弦相似度) |
| 14 | Event Clustering | Code | DBSCAN事件聚类 |
| 15 | LLM Rank | Code | 4维度LLM评分 |
| 16 | Generate Tweets | Code | 3角度推文生成 |
| 17 | Send to Slack | Code | Slack推送 |
| 18 | Send to Telegram | Code | Telegram推送 |

### 3.2 审批工作流 (slack-approvals.json)

**节点数**: 4 个

| # | 节点名称 | 功能 |
|---|----------|------|
| 1 | Slack Trigger | 监听Slack交互 |
| 2 | Process Approval | 处理审批决策 |
| 3 | Post to X | 发布到X/Twitter |
| 4 | Record Feedback | 记录反馈学习 |

---

## 四、数据源配置

### 4.1 RSS 源 (34个)

**Tier A - 官方源 (12个)**
- OpenAI News, DeepMind Blog, Google AI Blog
- LangChain Blog, Hugging Face Blog, Microsoft AI
- AWS ML, Meta AI, NVIDIA AI, Anthropic
- Stability AI, Cohere

**Tier B - 技术媒体 (10个)**
- TechCrunch AI, VentureBeat AI, The Verge AI
- Wired AI, MIT Tech Review, IEEE Spectrum
- ArXiv CS.AI, Papers With Code, AI Weekly
- Import AI

**Tier C - 社区源 (8个)**
- Hacker News, Reddit r/MachineLearning
- Towards Data Science, KDnuggets
- Analytics Vidhya, Machine Learning Mastery
- AI Alignment Forum, LessWrong AI

**Tier D - 补充源 (4个)**
- Google News AI, Bing News AI
- Yahoo Finance AI, Bloomberg AI

### 4.2 News API (6个)

| API | 配额 | 用途 |
|-----|------|------|
| NewsAPI.org | 100次/天 | 主力新闻源 |
| Currents API | 20次/天 | 补充源 |
| NewsData.io | 200次/天 | 高配额源 |
| GNews API | 100次/天 | 国际新闻 |
| TheNewsAPI | 100次/天 | 技术新闻 |
| Mediastack | 100次/月 | 备用源 |

### 4.3 X/Twitter

**关键词搜索 (7个)**
- GPT, Claude, Gemini, LLM, AI Agent, RAG, Fine-tuning

**账号搜索 (15个)**
- @OpenAI, @AnthropicAI, @GoogleAI, @DeepMind
- @LangChainAI, @huggingface, @weights_biases
- @kaboroevich, @ylecun, @sama, @demaboris
- @EMostaque, @DrJimFan, @svpino, @hwchung27

---

## 五、核心算法

### 5.1 语义去重 (Semantic Dedupe)

```
输入文章 → OpenAI Embedding → 余弦相似度计算 → 阈值过滤
```

| 参数 | 值 | 说明 |
|------|-----|------|
| 模型 | text-embedding-3-small | OpenAI嵌入模型 |
| 阈值 | 0.85 | 相似度阈值 |
| 过期 | 3天 | 嵌入缓存过期 |
| 上限 | 800条 | 最大缓存数 |

### 5.2 事件聚类 (Event Clustering)

**算法**: DBSCAN (Density-Based Spatial Clustering)

| 参数 | 值 | 说明 |
|------|-----|------|
| eps | 0.25 | 邻域半径 |
| minPts | 2 | 最小点数 |

### 5.3 LLM 评分 (4维度)

| 维度 | 分值 | 权重 |
|------|------|------|
| timeliness | 0-6 | 时效性 |
| impact | 0-9 | 影响力 |
| actionability | 0-7 | 可操作性 |
| relevance | 0-8 | 相关性 |

**总分**: 30分，阈值 18分

---

## 六、Phase 实现细节

### 6.1 Phase 1: 语义去重系统

**目标**: 消除内容重复，提高信息密度

```
┌─────────────────────────────────────────────────────────────┐
│                    语义去重流程                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  输入文章 ──→ URL去重 ──→ 生成Embedding ──→ 余弦相似度计算  │
│                                    │                        │
│                                    ▼                        │
│                           相似度 > 0.85?                    │
│                           /          \                      │
│                         是            否                    │
│                         ▼              ▼                    │
│                      标记重复       保留文章                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**关键文件**: `scripts/semantic-dedupe-node.js`

### 6.2 Phase 2: 多维度 LLM 评分

**目标**: 智能筛选高价值内容

**评分维度详解**:

| 维度 | 分值范围 | 评估标准 |
|------|----------|----------|
| timeliness | 0-6 | 发布时间、事件新鲜度 |
| impact | 0-9 | 行业影响、用户规模、技术突破 |
| actionability | 0-7 | 可操作性、实用价值 |
| relevance | 0-8 | AI行业相关度、目标受众匹配 |

**关键文件**: `scripts/llm-rank-node.js`

### 6.3 Phase 3: 智能化增强

**目标**: 事件聚类 + 反馈学习

**事件聚类 (DBSCAN)**:
```
输入: 文章Embedding向量集合
参数: eps=0.25, minPts=2
输出: 聚类标签 (cluster_id)

流程:
1. 计算文章间距离矩阵
2. 识别核心点 (邻域内点数 >= minPts)
3. 扩展聚类 (距离 <= eps)
4. 标记噪声点 (cluster_id = -1)
```

**反馈学习系统**:
```
用户反馈 ──→ 存储反馈 ──→ 分析偏好 ──→ 调整权重
    │                                      │
    └──────────────────────────────────────┘
                  持续优化
```

**关键文件**:
- `scripts/event-clustering-node.js`
- `scripts/feedback-storage.js`
- `scripts/feedback-learning.js`

### 6.4 Phase 4: 监控可观测性

**目标**: 全链路监控 + 告警

**监控指标**:

| 指标 | 类型 | 说明 |
|------|------|------|
| workflow_executions_total | Counter | 工作流执行次数 |
| workflow_duration_seconds_sum | Counter | 执行总耗时（秒） |
| openai_api_calls_total | Counter | API调用次数 |
| openai_api_cost_usd | Gauge | API成本 |
| content_processed_total | Counter | 处理内容数 |
| content_quality_score_avg | Gauge | 平均质量分 |
| errors_total | Counter | 错误次数 |

**关键文件**:
- `scripts/metrics-collector.js`
- `monitoring/prometheus.yml`
- `monitoring/alerts.yml`

**当前运行态说明（2026-01-27）**:
- 指标收集器已实现，但 n8n / config-server 默认未暴露 `/metrics`
- 生产侧的“可观测性主入口”目前是探针脚本：
  - `npm run probe`
  - `npm run probe:notify:send`
  - 详见 `docs/RUNBOOK.md`

---

## 七、安全架构

### 7.1 认证机制

**Webhook 认证**:
```
请求 ──→ Header Auth 验证 ──→ X-Webhook-Secret 匹配?
                                    │
                              是    │    否
                              ▼     │    ▼
                           处理请求  │  返回 401
```

**Config Server 认证**:
```
请求 ──→ X-API-Key Header ──→ 密钥匹配?
                                │
                          是    │    否
                          ▼     │    ▼
                       处理请求  │  返回 401
```

### 7.2 环境变量隔离

| 配置项 | 值 | 说明 |
|--------|-----|------|
| N8N_BLOCK_ENV_ACCESS_IN_NODE | false（目标 true） | 现状为兼容 $env，后续需迁移 |
| ALLOWED_ORIGINS | 指定域名 | CORS 白名单 |

### 7.3 密钥管理

| 密钥 | 用途 | 存储位置 |
|------|------|----------|
| WEBHOOK_SECRET | Webhook 认证 | .env + n8n Credential |
| CONFIG_API_KEY | Config Server 认证 | .env |
| OPENAI_API_KEY | OpenAI API | .env |
| SLACK_BOT_TOKEN | Slack 推送 | .env |
| TELEGRAM_DAILY_BOT_TOKEN | Telegram 推送 | .env |
| TELEGRAM_DAILY_CHAT_ID | Telegram 推送 | .env |
| N8N_API_KEY | n8n API 认证 | .env |

### 7.4 安全扫描

**CI/CD 集成**:
- **Snyk**: 依赖漏洞扫描
- **Semgrep**: 代码安全分析
- **npm audit**: 包安全检查

---

## 八、部署架构

### 8.1 Docker 服务

```yaml
services:
  n8n:            # 工作流引擎 (端口 5678)
  config-server:  # 配置服务 (端口 3001)

# monitoring/docker-compose.yml（可选监控栈）
#   prometheus:   # 监控 (端口 9090)
#   grafana:      # 可视化 (端口 3000)
```

### 8.2 服务依赖

```
┌─────────────────────────────────────────────────────────┐
│                 docker-compose.yml                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────┐      ┌──────────────┐                      │
│  │   n8n   │ ───→ │ config-server│                      │
│  │  :5678  │      │    :3001     │                      │
│  └─────────┘      └──────────────┘                      │
│                                                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│           monitoring/docker-compose.yml（可选）          │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐      ┌──────────┐                     │
│  │ prometheus  │ ───→ │ grafana  │                     │
│  │   :9090     │      │  :3000   │                     │
│  └─────────────┘      └──────────┘                     │
└─────────────────────────────────────────────────────────┘
```

### 8.3 数据持久化

| 服务 | Volume | 说明 |
|------|--------|------|
| n8n | `${HOME}/.n8n` | 工作流数据（SQLite + 执行数据） |
| config-server | `./config` | 配置文件（关键词/源头策略） |
| prometheus | `prometheus_data` | 监控数据（监控栈 compose 内） |
| grafana | `grafana_data` | 仪表盘配置（监控栈 compose 内） |

---

## 九、文件结构

```
x-daily-pack/
├── workflows/                    # n8n 工作流
│   ├── daily-pack-v5-fixed.json  # 主工作流 (18节点)
│   └── slack-approvals.json      # 审批工作流 (4节点)
│
├── scripts/                      # 核心脚本
│   ├── semantic-dedupe-node.js   # 语义去重
│   ├── event-clustering-node.js  # 事件聚类
│   ├── llm-rank-node.js          # LLM评分
│   ├── feedback-storage.js       # 反馈存储
│   ├── feedback-learning.js      # 反馈学习
│   ├── ai-quality-gate.js        # AI质量守门
│   ├── rag-enhanced-rank.js      # RAG增强评分
│   ├── metrics-collector.js      # 指标收集
│   ├── config-server.js          # 配置服务
│   ├── deploy_daily_pack.py      # 同步代码节点与调度 ⭐
│   ├── drift_check_daily_pack.py # 漂移检测（cron + 代码节点）⭐
│   ├── probe_daily_pack.py       # 健康探针 ⭐
│   ├── probe_daily_pack_notify.py# 巡检告警（去重+冷却）⭐
│   └── trigger_daily_pack.py     # 手工触发 + 验证 ⭐
│
├── monitoring/                   # 监控配置
│   ├── docker-compose.yml        # 监控服务
│   ├── prometheus.yml            # Prometheus配置
│   └── alerts.yml                # 告警规则
│
├── tests/                        # 测试
│   ├── suites/unit/              # 单元测试
│   ├── suites/integration/       # 集成测试
│   ├── suites/e2e/               # E2E测试
│   ├── setup/mocks/              # MSW mocks
│   └── fixtures/                 # 测试数据
│
├── docs/                         # 文档
│   ├── ARCHITECTURE.md           # 架构文档
│   ├── SECURITY.md               # 安全文档
│   ├── RUNBOOK.md                # 生产运维主入口 ⭐
│   ├── OPERATIONS.md             # 运维手册（对齐 Runbook）
│   └── plans/                    # 实施计划
│
├── .github/workflows/            # CI/CD
│   └── test.yml                  # 测试流水线
│
├── docker-compose.yml            # 主服务配置
├── package.json                  # 依赖配置
├── vitest.config.ts              # 测试配置
├── CLAUDE.md                     # 项目总结
└── README.md                     # 项目说明
```

---

## 十、版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v5-fixed | 2026-01-27 | Runbook/Probe/Drift-Check 固化，运维入口标准化 |
| v5-fixed | 2026-01-25 | Phase 1-4 全部完成，安全加固 |
| v5 | 2026-01-24 | Phase 3 智能化增强 |
| v4 | 2026-01-23 | Phase 2 多维度评分 |
| v3 | 2026-01-22 | Phase 1 语义去重 |
| v2 | 2026-01-21 | 基础工作流 |
| v1 | 2026-01-20 | 初始版本 |
