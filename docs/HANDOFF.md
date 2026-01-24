# Handoff (Current State + Next Tasks)

**最后更新**: 2026-01-24
**项目状态**: ✅ Phase 1-3 全部完成

## 当前状态

### 系统已跑通 ✅

- n8n 本地 Docker 自托管：`http://localhost:5678`
- 主工作流：18节点，每日 UTC 00:00/12:00 自动执行
- 审批工作流：4节点，每分钟轮询 Slack
- X 发推：通过 Rube MCP (Streamable HTTP)
- 测试覆盖：59个测试用例

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
# 运行测试
node tests/run-all.js

# 检查 n8n 状态
curl -s http://localhost:5678/healthz

# 重启 n8n
docker restart n8n-local
```

## 下一步建议

1. **观察运行**: 监控 3-5 天收集反馈数据
2. **Phase 4**: 历史数据库/周报月报 (可选)
3. **参数调优**: 根据实际效果调整聚类/学习参数

## 详细文档

- `CLAUDE.md` - 项目总结 (最重要)
- `docs/WORKFLOWS.md` - 工作流详解
- `docs/OPERATIONS.md` - 运维手册
