# Workflows

**版本**: v5-fixed (18节点主流程 + 4节点审批流程)

> 重要：生产环境以脚本同步为准（避免 UI 漂移）
>
> ```bash
> npm run deploy
> npm run drift-check
> ```

## 主流程 (18节点)

`workflows/daily-pack-v5-fixed.json`

### 节点列表
1. Trigger UTC 0h 12h
2. Manual Trigger
3. Multi News API
4. RSS Fetch All (34源)
5. X Keyword Search
6. X Account Search (15账号)
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

### 生产一致性（推荐流程）

- 调度与 Code 节点的“真相来源”是仓库脚本
- 使用 `npm run deploy` 将脚本同步到 live n8n
- 使用 `npm run drift-check` 检查 cron + 代码节点是否漂移
- 使用 `npm run probe` 验证最近成功与 Slack 命中

## 审批流程 (4节点)

`workflows/slack-approvals.json`

1. Manual Trigger
2. Every Minute
3. Process Slack Commands
4. Record Feedback ⭐ Phase 3
