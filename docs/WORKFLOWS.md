# Workflows

**版本**: v5-fixed (18节点主流程 + 4节点审批流程)

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

## 审批流程 (4节点)

`workflows/slack-approvals.json`

1. Manual Trigger
2. Every Minute
3. Process Slack Commands
4. Record Feedback ⭐ Phase 3
