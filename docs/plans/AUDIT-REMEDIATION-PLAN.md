# X Daily Pack 审计修复与AI增强实施计划

**创建日期**: 2026-01-25
**计划版本**: v1.0
**计划状态**: 待审批

---

## 状态更新（2026-01-27）

本计划中的多项内容已经部分落地，当前运行态建议以 runbook 为准：

- 运维主入口：`docs/RUNBOOK.md`
- 标准顺序：
  - `npm run deploy`
  - `npm run drift-check`
  - `npm run probe`

已对齐的关键点：
- Webhook Header Auth 已启用
- Config Server API Key 校验已启用，调用端已带 `X-API-Key`
- runner 请求等待超时已提升到 300s

仍需持续跟踪：
- `N8N_BLOCK_ENV_ACCESS_IN_NODE=true` 仍未落地（$env 依赖较多）
- 建议轮换 `WEBHOOK_SECRET`（建议同时轮换 `N8N_API_KEY`）

---

## 一、执行摘要

基于 Codex 审计报告和验证结果，本计划分4个阶段实施：

| 阶段 | 名称 | 优先级 | 预计工作量 |
|------|------|--------|------------|
| Phase 1 | 安全加固 | 🔴 紧急 | 8-12小时 |
| Phase 2 | CI/CD 增强 | 🟡 高 | 4-6小时 |
| Phase 3 | AI 增强集成 | 🟢 中 | 16-24小时 |
| Phase 4 | 监控可观测性 | 🟢 中 | 8-12小时 |

**决策依据**:
1. 安全问题必须优先修复，防止潜在攻击
2. CI/CD 是质量保障基础，需在 AI 增强前完善
3. AI 增强是核心价值提升，但依赖前两阶段
4. 监控是长期运维保障

---

## 二、Phase 1: 安全加固 (紧急)

### 2.1 问题清单

| ID | 问题 | 风险等级 | 文件位置 |
|----|------|----------|----------|
| S1 | Webhook 无鉴权 | 🔴 高 | `workflows/daily-pack-v5-fixed.json` |
| S2 | Config Server 无鉴权可写 | 🔴 高 | `scripts/config-server.js` |
| S3 | 环境变量全局暴露 | 🔴 高 | `docker-compose.yml` |
| S4 | CORS 完全开放 | 🟡 中 | `scripts/config-server.js:103` |

### 2.2 任务分解

#### Task 1.1: Webhook 鉴权

**目标**: 为 Webhook Trigger 添加 Header 认证

**实施方案**:
```json
{
  "parameters": {
    "path": "x-daily-pack-trigger",
    "authentication": "headerAuth",
    "options": {
      "headerAuth": {
        "name": "X-Webhook-Secret",
        "value": "={{$env.WEBHOOK_SECRET}}"
      }
    }
  }
}
```

**环境变量**:
```bash
# .env 添加
WEBHOOK_SECRET=<生成32位随机字符串>
```

**验证方法**:
```bash
# 无认证应返回 401
curl -X POST http://localhost:5678/webhook/x-daily-pack-trigger

# 有认证应返回 200
curl -X POST http://localhost:5678/webhook/x-daily-pack-trigger \
  -H "X-Webhook-Secret: $WEBHOOK_SECRET"
```

---

#### Task 1.2: Config Server 鉴权

**目标**: 为 Config Server 添加 API Key 认证

**修改文件**: `scripts/config-server.js`

**实施方案**:
```javascript
// 新增认证中间件
const API_KEY = process.env.CONFIG_API_KEY;

const authenticate = (req, res) => {
  if (!API_KEY) {
    console.warn('[Config] WARNING: CONFIG_API_KEY not set, running in insecure mode');
    return true;
  }
  const key = req.headers['x-api-key'];
  if (key !== API_KEY) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return false;
  }
  return true;
};

// 在请求处理中调用
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');

  // CORS 限制为内部网络
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5678'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }

  // 健康检查不需要认证
  if (req.url === '/health') {
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // 其他端点需要认证
  if (!authenticate(req, res)) return;

  // ... 原有逻辑
});
```

**环境变量**:
```bash
# .env 添加
CONFIG_API_KEY=<生成32位随机字符串>
ALLOWED_ORIGINS=http://localhost:5678,http://n8n:5678
```

---

#### Task 1.3: 环境变量隔离

**目标**: 禁止 n8n Function 节点访问所有环境变量

**修改文件**: `docker-compose.yml`

**当前配置** (不安全):
```yaml
- N8N_BLOCK_ENV_ACCESS_IN_NODE=false
```

**目标配置**:
```yaml
- N8N_BLOCK_ENV_ACCESS_IN_NODE=true
```

**影响分析**:
需要检查所有使用 `$env` 的节点，改为通过节点参数传递：

| 节点 | 当前方式 | 修改方式 |
|------|----------|----------|
| LLM Rank | `process.env.OPENAI_API_KEY` | 通过 Credentials |
| Semantic Dedupe | `process.env.OPENAI_API_KEY` | 通过 Credentials |
| Event Clustering | `process.env.OPENAI_API_KEY` | 通过 Credentials |

---

#### Task 1.4: CORS 收紧

**目标**: 限制 CORS 为已知来源

**已在 Task 1.2 中包含**

---

### 2.3 Phase 1 验收标准

- [ ] Webhook 无认证请求返回 401
- [ ] Config Server 无认证请求返回 401
- [ ] `/health` 端点无需认证可访问
- [ ] n8n Function 节点无法访问 `process.env`
- [ ] 所有工作流正常执行
- [ ] 单元测试全部通过

---

## 三、Phase 2: CI/CD 增强

### 3.1 问题清单

| ID | 问题 | 影响 |
|----|------|------|
| C1 | 覆盖率路径不匹配 | Codecov 上传失败 |
| C2 | 仅运行单元测试 | 集成测试未覆盖 |
| C3 | npm audit 漏洞未阻断 | 7个中危漏洞 |
| C4 | 缺少 AI 安全扫描 | 代码漏洞未检测 |

### 3.2 任务分解

#### Task 2.1: 修复覆盖率路径

**修改文件**: `.github/workflows/test.yml`

**当前配置**:
```yaml
files: ./coverage/coverage-final.json
```

**目标配置**:
```yaml
files: ./tests/reports/coverage/coverage-final.json
```

---

#### Task 2.2: 添加 Snyk 安全扫描

**目标**: 替代 npm audit，提供更好的漏洞检测和修复建议

**添加到**: `.github/workflows/test.yml`

```yaml
- name: Snyk Security Scan
  uses: snyk/actions/node@master
  continue-on-error: true
  env:
    SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
  with:
    args: --severity-threshold=high
```

**所需配置**:
1. 在 Snyk.io 注册免费账号
2. 获取 API Token
3. 添加到 GitHub Secrets: `SNYK_TOKEN`

---

#### Task 2.3: 添加 Semgrep AI 扫描

**目标**: 检测代码安全漏洞和最佳实践

```yaml
- name: Semgrep SAST
  uses: semgrep/semgrep-action@v1
  with:
    config: >-
      p/javascript
      p/nodejs
      p/security-audit
```

---

#### Task 2.4: 升级有漏洞的依赖

**当前漏洞**:
- esbuild <= 0.24.2 (SSRF)
- 影响: vite, vitest, @vitest/*

**升级命令**:
```bash
npm update vitest @vitest/coverage-v8 @vitest/ui vite --save-dev
```

**验证**:
```bash
npm audit --audit-level=moderate
npm run test:unit
```

### 3.3 Phase 2 验收标准

- [ ] Codecov 成功接收覆盖率报告
- [ ] Snyk 扫描在 CI 中运行
- [ ] Semgrep 扫描在 CI 中运行
- [ ] npm audit 无高危漏洞
- [ ] 所有测试通过

---

## 四、Phase 3: AI 增强集成

### 4.1 目标

引入 AI 能力提升内容处理质量：
1. **AI 内容质量守门员** - 自动评估内容可信度
2. **RAG 增强评分** - 基于历史数据的智能评分
3. **AI Agent 协调器** - 多源采集智能调度

### 4.2 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| Agent 框架 | n8n AI Agent + LangChain | 原生集成，无需额外部署 |
| 向量存储 | Pinecone / Qdrant | 云托管，免运维 |
| LLM | OpenAI GPT-4o-mini | 已有集成，成本可控 |
| Embedding | OpenAI text-embedding-3-small | 性价比高 |

### 4.3 任务分解

#### Task 3.1: AI 内容质量守门员

**目标**: 在 LLM Rank 后添加质量检查节点

**新增文件**: `scripts/ai-quality-gate.js`

```javascript
// AI 质量守门员 - 检测低质量/可疑内容
const qualityCheckPrompt = `
分析以下新闻内容，返回JSON格式评估：
{
  "factuality": 0-10,      // 事实可信度
  "bias_risk": "low|medium|high",  // 偏见风险
  "spam_score": 0-10,      // 垃圾内容分数
  "recommendation": "pass|review|reject"
}

内容: {content}
`;
```

**集成位置**: LLM Rank 节点之后，Send to Slack 之前

---

#### Task 3.2: RAG 增强评分系统

**目标**: 基于历史高质量内容改进评分

**架构**:
```
历史优质内容 → Embedding → Vector Store
                              ↓
新内容 → Embedding → 相似度检索 → 上下文增强评分
```

**新增文件**: `scripts/rag-enhanced-rank.js`

**依赖安装**:
```bash
npm install @langchain/openai @langchain/community
```

---

#### Task 3.3: n8n AI Agent 工作流

**目标**: 使用 n8n 原生 AI Agent 节点替代部分 Code 节点

**优势**:
- 可视化调试
- 内置 Memory 管理
- 原生 Tool 调用

**实施**: 在 n8n 中添加 AI Agent 节点，配置 LangChain 工具链

### 4.4 Phase 3 验收标准

- [ ] AI 质量守门员节点正常运行
- [ ] 低质量内容被正确标记
- [ ] RAG 系统能检索相似历史内容
- [ ] 评分准确性提升 (通过 A/B 测试验证)

---

## 五、Phase 4: 监控可观测性

### 5.1 目标

建立完整的监控体系：
- 工作流执行监控
- API 成本追踪
- 异常告警

### 5.2 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| 指标收集 | Prometheus | 开源标准 |
| 可视化 | Grafana | AI Assistant 支持 |
| 日志 | Loki | 与 Grafana 原生集成 |

### 5.3 任务分解

#### Task 4.1: 添加 Prometheus + Grafana

**新增文件**: `monitoring/docker-compose.monitoring.yml`

```yaml
services:
  prometheus:
    image: prom/prometheus:v2.50.0
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana:10.3.0
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

---

#### Task 4.2: 关键指标定义

| 指标名 | 类型 | 描述 | 告警阈值 |
|--------|------|------|----------|
| `workflow_duration_seconds_sum` | Counter | 执行总时长（秒） | 增量 > 300s |
| `openai_api_calls_total` | Counter | API 调用次数 | > 100/h |
| `openai_api_cost_usd` | Gauge | API 成本 | > $5/day |
| `content_processed_total` | Counter | 处理内容数 | - |
| `content_quality_score_avg` | Gauge | 平均质量分数 | < 15 |

### 5.4 Phase 4 验收标准

- [ ] Grafana Dashboard 可访问
- [ ] 关键指标正常采集
- [ ] 告警规则配置完成

---

## 六、执行顺序与依赖

```
Phase 1 (安全) ──┬──→ Phase 2 (CI/CD)
                │
                └──→ Phase 3 (AI) ──→ Phase 4 (监控)
```

**关键路径**: Phase 1 必须先完成，Phase 2/3 可并行

---

## 七、风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 环境变量隔离导致工作流失败 | 中 | 高 | 先在测试环境验证 |
| 依赖升级破坏兼容性 | 中 | 中 | 逐个升级，每次测试 |
| AI 增强增加 API 成本 | 高 | 中 | 设置成本上限告警 |

---

## 八、审批与启动

**计划审批人**: Henry
**预计启动**: 审批后立即开始
**首个里程碑**: Phase 1 完成

---

**下一步**: 请审批此计划，我将从 Phase 1 安全加固开始实施。
