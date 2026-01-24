# X Daily Pack

AI 行业日报自动化系统 - 采集、去重、评分、推送到 Slack/Telegram，审批后发布到 X/Twitter。

## 技术栈

- **工作流**: n8n (Docker 自托管, port 5678)
- **LLM**: OpenAI gpt-4o-mini
- **Embedding**: text-embedding-3-small
- **数据源**: 34 RSS + 6 News API + X/Twitter

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
└── ...

config/
├── rss-feeds.json              # RSS源配置
└── x-queries.json              # X查询配置
```

## 常用命令

```bash
# 启动 n8n
docker run -d --name n8n-local -p 5678:5678 \
  -v $HOME/.n8n:/home/node/.n8n \
  --env-file /home/henry/x/.env \
  --restart=always n8nio/n8n:latest

# 重启
docker restart n8n-local

# 运行测试
node tests/run-all.js
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
