# Handoff (Current State + Next Tasks)

**最后更新**: 2026-01-27
**项目状态**: ✅ Phase 1-4 完成 + 运维 Runbook 已固化

## 当前状态

### 系统已跑通 ✅

- n8n 本地 Docker 自托管：`http://localhost:5678`
- 主工作流：18节点，每日 UTC 00:00/12:00 自动执行（由 deploy 脚本对齐）
- 审批工作流：4节点，每分钟轮询 Slack
- X 发推：通过 Rube MCP (Streamable HTTP)
- 测试覆盖：Vitest 70 个测试用例（外部网络偶发波动）

### 运维入口已标准化 ✅

推荐固定顺序（全部 API/日志级可复现）：

```bash
npm run deploy
npm run drift-check
npm run probe
npm run trigger:webhook
```

巡检告警入口：

```bash
npm run probe:notify        # dry-run
npm run probe:notify:send   # 实际发送（建议配 cron）
```

### 工作流

| 工作流 | 节点数 | 说明 |
|--------|--------|------|
| `daily-pack-v5-fixed.json` | 18 | 主流程 |
| `slack-approvals.json` | 4 | 审批+反馈 |

### Phase 3 新功能 (2026-01-24)

**事件聚类**:
- DBSCAN 算法 (eps=0.25, minPts=2)
- 同一事件多篇报道自动分组
- LLM 生成事件标签

**反馈学习**:
- 用户审批行为自动记录
- 分类/来源偏好权重计算
- 权重应用到 LLM Rank 评分

## 关键文件

```
workflows/
├── daily-pack-v5-fixed.json    # 主流程 (18节点)
└── slack-approvals.json        # 审批流程 (4节点)

scripts/
├── event-clustering-node.js    # 事件聚类 ⭐ Phase 3
├── feedback-storage.js         # 反馈存储 ⭐ Phase 3
├── feedback-learning.js        # 反馈学习 ⭐ Phase 3
├── llm-rank-node.js            # LLM评分 (含学习权重)
├── deploy_daily_pack.py        # 同步代码节点/调度到 live n8n ⭐
├── drift_check_daily_pack.py   # 漂移检测（cron + 代码节点）⭐
├── probe_daily_pack.py         # 健康探针（调度/成功率/Slack）⭐
├── probe_daily_pack_notify.py  # 探针告警（去重+冷却）⭐
└── ...

tests/
└── suites/unit/
    ├── clustering.test.js      # 10个测试
    ├── feedback.test.js        # 5个测试
    └── learning.test.js        # 8个测试
```

## 环境变量

```bash
# Phase 3 新增
EVENT_CLUSTERING_ENABLED=true
FEEDBACK_LEARNING_ENABLED=true
```

## 验证命令

```bash
# 标准运维顺序
npm run deploy
npm run drift-check
npm run probe
npm run trigger:webhook

# 运行测试
npm test
npm run test:unit

# 重启 n8n
docker compose restart n8n
```

## 下一步建议

1. **密钥轮换（高优先级）**: 轮换 `WEBHOOK_SECRET`（建议顺手轮换 `N8N_API_KEY`）
2. **巡检告警落地**: 为 `npm run probe:notify:send` 配置 cron（见 `docs/RUNBOOK.md`）
3. **成功率持续观察**: 探针当前 success_rate 约 0.67（历史包袱），建议持续观察
4. **安全基线迁移（规划项）**: `N8N_BLOCK_ENV_ACCESS_IN_NODE=true` 仍未落地（$env 依赖较多）
5. **监控体系对齐（规划项）**: Prometheus/Grafana 指标端点尚未完全打通

## 详细文档

- `CLAUDE.md` - 项目总结 (最重要)
- `docs/RUNBOOK.md` - 生产运维 Runbook（最推荐）
- `docs/WORKFLOWS.md` - 工作流详解
- `docs/OPERATIONS.md` - 运维手册
