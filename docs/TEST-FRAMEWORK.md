# 测试框架文档

**最后更新**: 2026-01-24
**版本**: v2.0
**测试用例**: 59个

---

## 一、测试架构

```
tests/
├── run-all.js              # 统一入口 ⭐
├── config/test.config.js   # 测试配置
├── lib/
│   ├── assertions.js       # 断言库
│   ├── http-client.js      # HTTP客户端
│   └── reporter.js         # 报告生成器
└── suites/
    ├── unit/               # 单元测试 (32个)
    │   ├── config.test.js
    │   ├── dedupe.test.js
    │   ├── scoring.test.js
    │   ├── clustering.test.js   # ⭐ Phase 3
    │   ├── feedback.test.js     # ⭐ Phase 3
    │   └── learning.test.js     # ⭐ Phase 3
    ├── integration/        # 集成测试 (18个)
    │   ├── n8n-api.test.js
    │   ├── news-apis.test.js
    │   ├── rss-feeds.test.js
    │   └── rss-parsing.test.js
    └── e2e/                # 端到端测试 (4个)
        └── workflow.test.js
```

## 二、测试命令

```bash
# 全部测试 (59个用例)
node tests/run-all.js

# 分类运行
node tests/run-all.js unit         # 单元测试
node tests/run-all.js integration  # 集成测试
node tests/run-all.js e2e          # 端到端测试
```

## 三、测试覆盖

| 类别 | 数量 | 说明 |
|------|------|------|
| 配置验证 | 5 | 环境变量、配置文件 |
| 去重逻辑 | 4 | URL去重、语义去重 |
| 评分逻辑 | 5 | LLM评分、Tier加权 |
| 事件聚类 | 10 | DBSCAN算法 ⭐ Phase 3 |
| 反馈存储 | 5 | 反馈记录 ⭐ Phase 3 |
| 反馈学习 | 8 | 权重计算 ⭐ Phase 3 |
| n8n API | 5 | 工作流、执行 |
| News APIs | 3 | 6个API可用性 |
| RSS源 | 7 | 34源可用性 |
| RSS解析 | 3 | 内容解析 |
| 工作流E2E | 4 | 完整执行 |
| **总计** | **59** | |

## 四、运行要求

1. n8n 容器运行中
2. Node.js 18+
3. 环境变量已配置 (.env)

## 五、工作流

| Workflow | 节点数 | 状态 |
|----------|--------|------|
| X Daily Pack v5 | 18 | 已激活 |
| Slack Approvals | 4 | 已激活 |

## 六、Phase 3 新增测试

### 事件聚类 (10个)
- 余弦相似度计算
- DBSCAN聚类算法
- 聚类大小限制
- 边界条件处理

### 反馈学习 (13个)
- 反馈记录存储
- 分类偏好计算
- 来源偏好计算
- 权重衰减
- 学习算法
