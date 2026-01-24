# X Daily Pack - 项目总结 (CLAUDE.md)

**最后更新**: 2026-01-24
**项目状态**: ✅ Phase 1-3 全部完成 + 测试架构升级
**版本**: v5-fixed (18节点主流程 + 4节点审批流程)
**仓库**: https://github.com/zynovex-support/x-daily-pack

---

## 📋 项目概述

**项目名称**: X Daily Pack
**目标**: AI 行业日报 - 自动采集、去重、评分、推送内容到 Slack/Telegram，并支持编辑后发布到 X/Twitter

## 🎯 核心功能

### 数据采集
- **RSS 源**: 34个（Tier A/B/C/D 分层）
- **新闻API**: 6个API并行采集
- **X/Twitter**: 7个关键词查询 + 15个账号搜索

### 内容处理流程
```
采集 → 标准化 → URL去重 → 语义去重 → 事件聚类 → LLM评分 → 生成推文 → 推送
```

## 🏗️ 系统架构

### 工作流
| 工作流 | 节点数 | 说明 |
|--------|--------|------|
| `daily-pack-v5-fixed.json` | 18 | 主流程 |
| `slack-approvals.json` | 4 | 审批+反馈 |

### 关键节点 (18个)
1. Trigger UTC 0h 12h
2. Manual Trigger
3. Multi News API
4. RSS Fetch All
5. X Keyword Search
6. X Account Search
7. Merge RSS+News
8. Merge X
9. Merge All
10. Normalize
11. Cross-Day Dedupe
12. Semantic Dedupe
13. Event Clustering ⭐ Phase 3
14. LLM Rank
15. Generate Tweets
16. Send to Slack
17. Send to Telegram
18. NoOp

## 🔑 关键技术

### Phase 1: 语义去重
- Embedding + 余弦相似度
- 阈值: 0.85

### Phase 2: 多维度评分
- timeliness (0-6)
- impact (0-9)
- actionability (0-7)
- relevance (0-8)

### Phase 3: 智能化
- **事件聚类**: DBSCAN (eps=0.25, minPts=2)
- **反馈学习**: 用户偏好权重

## 📁 文件结构

```
scripts/
├── event-clustering-node.js    # 事件聚类 ⭐ Phase 3
├── feedback-storage.js         # 反馈存储 ⭐ Phase 3
├── feedback-learning.js        # 反馈学习 ⭐ Phase 3
├── llm-rank-node.js            # LLM评分
└── ...

tests/
└── suites/unit/
    ├── clustering.test.js      # 10个测试
    ├── feedback.test.js        # 5个测试
    └── learning.test.js        # 8个测试
```

## ⚙️ 环境变量

```bash
# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_CHANNEL_ID=C0A9AQF078V

# Phase 3
EVENT_CLUSTERING_ENABLED=true
FEEDBACK_LEARNING_ENABLED=true
```

## 🧪 测试

### 测试框架
- **Vitest**: 现代测试框架，60个测试用例
- **MSW**: Mock Service Worker，API模拟
- **Promptfoo**: LLM输出质量测试

### 测试命令
```bash
npm test              # 运行所有测试
npm run test:unit     # 单元测试 (38个)
npm run test:coverage # 覆盖率报告
npm run test:ai       # Promptfoo AI测试
```

### 测试结构
```
tests/
├── suites/unit/        # 单元测试 (6个文件)
├── suites/integration/ # 集成测试 (4个文件)
├── suites/e2e/         # E2E测试 (1个文件)
├── setup/mocks/        # MSW mock handlers
├── fixtures/           # 测试数据
└── ai/                 # Promptfoo配置
```

---

**最后更新**: 2026-01-24 | Phase 3 完成 + 测试架构升级
