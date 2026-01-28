# X Daily Pack - 监控指南

**版本**: v1.0
**最后更新**: 2026-01-27

---

## 一、监控架构

```
┌─────────────────────────────────────────────────────────────┐
│                    监控系统架构                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐ │
│  │    n8n      │      │Config Server│      │   其他服务   │ │
│  │   :5678     │      │   :3001     │      │             │ │
│  └──────┬──────┘      └──────┬──────┘      └──────┬──────┘ │
│         │                    │                    │         │
│         └────────────────────┼────────────────────┘         │
│                              ▼                              │
│                    ┌─────────────────┐                      │
│                    │   Prometheus    │                      │
│                    │     :9090       │                      │
│                    └────────┬────────┘                      │
│                             │                               │
│                             ▼                               │
│                    ┌─────────────────┐                      │
│                    │    Grafana      │                      │
│                    │     :3000       │                      │
│                    └─────────────────┘                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、生产监控主入口（当前推荐）

当前生产环境的“可复现监控主入口”是探针脚本（API/日志级证据）：

```bash
npm run drift-check
npm run probe
npm run probe:notify
```

如果需要自动告警（建议配 cron）：

```bash
npm run probe:notify:send
```

建议 cron（每 15 分钟）：

```bash
*/15 * * * * cd /home/henry/x && npm run probe:notify:send >> logs/probe-notify.log 2>&1
```

更多细节见：`docs/RUNBOOK.md`

---

## 三、快速启动

### 2.1 启动监控服务

```bash
# 进入监控目录
cd monitoring

# 启动 Prometheus + Grafana
docker compose up -d

# 验证服务
docker compose ps
```

> 注意：Prometheus/Grafana 目前属于“可选监控栈”。默认情况下 n8n/config-server 未暴露 `/metrics`。

### 2.2 访问地址

| 服务 | 地址 | 默认凭据 |
|------|------|----------|
| Prometheus | http://localhost:9090 | 无需认证 |
| Grafana | http://localhost:3000 | admin / admin |

---

## 四、监控指标

### 3.1 工作流指标

| 指标名称 | 类型 | 说明 |
|----------|------|------|
| `workflow_executions_total` | Counter | 工作流执行总次数 |
| `workflow_duration_seconds_sum` | Counter | 工作流执行总耗时 |

### 3.2 API 指标

| 指标名称 | 类型 | 说明 |
|----------|------|------|
| `openai_api_calls_total` | Counter | OpenAI API 调用次数 |
| `openai_api_cost_usd` | Gauge | API 累计成本 (USD) |

### 3.3 内容指标

| 指标名称 | 类型 | 说明 |
|----------|------|------|
| `content_processed_total` | Counter | 处理内容总数 |
| `content_quality_score_avg` | Gauge | 平均质量分数 |

### 3.4 错误指标

| 指标名称 | 类型 | 说明 |
|----------|------|------|
| `errors_total` | Counter | 错误总数 |

---

## 五、告警规则

### 4.1 已配置告警

| 告警名称 | 条件 | 严重级别 | 说明 |
|----------|------|----------|------|
| WorkflowExecutionSlow | duration > 300s (5min) | warning | 工作流执行超时 |
| HighAPIUsage | rate > 100/hour | warning | API 调用频率过高 |
| LowContentQuality | avg score < 15 | info | 内容质量偏低 |

### 4.2 告警配置文件

```yaml
# monitoring/alerts.yml
groups:
  - name: x-daily-pack
    rules:
      - alert: WorkflowExecutionSlow
        expr: increase(workflow_duration_seconds_sum[5m]) > 300
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "工作流执行超时"

      - alert: HighAPIUsage
        expr: rate(openai_api_calls_total[1h]) > 100
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "OpenAI API 调用频率过高"

      - alert: LowContentQuality
        expr: avg(content_quality_score_avg) < 15
        for: 30m
        labels:
          severity: info
        annotations:
          summary: "内容质量分数偏低"
```

---

## 六、Prometheus 配置

### 5.1 抓取配置

```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 30s
  evaluation_interval: 30s

scrape_configs:
  - job_name: 'n8n'
    static_configs:
      - targets: ['n8n:5678']
    metrics_path: /metrics

  - job_name: 'config-server'
    static_configs:
      - targets: ['config-server:3001']
    metrics_path: /metrics
```

### 5.2 常用 PromQL 查询

```promql
# 工作流执行次数 (过去1小时)
increase(workflow_executions_total[1h])

# API 调用速率 (每分钟)
rate(openai_api_calls_total[5m]) * 60

# 平均内容质量
avg(content_quality_score_avg)

# 错误率
rate(errors_total[1h])
```

---

## 七、Grafana 配置

### 6.1 添加数据源

1. 登录 Grafana (http://localhost:3000)
2. 进入 Configuration → Data Sources
3. 添加 Prometheus 数据源:
   - URL: `http://prometheus:9090`
   - Access: Server (default)

### 6.2 推荐仪表盘面板

| 面板 | 查询 | 可视化类型 |
|------|------|------------|
| 工作流执行 | `workflow_executions_total` | Stat |
| API 成本 | `openai_api_cost_usd` | Gauge |
| 内容质量趋势 | `content_quality_score_avg` | Time series |
| 错误统计 | `errors_total` | Stat |

---

## 八、指标收集器

### 7.1 使用方法

```javascript
const metrics = require('./scripts/metrics-collector');

// 记录工作流执行
metrics.recordWorkflowExecution(durationMs);

// 记录 API 调用
metrics.recordAPICall(cost);

// 记录内容处理
metrics.recordContent(qualityScore);

// 记录错误
metrics.recordError();

// 获取 Prometheus 格式指标
const output = metrics.getPrometheusMetrics();
```

### 7.2 指标端点

当前运行态说明（2026-01-27）：
- `scripts/metrics-collector.js` 已实现 Prometheus 文本输出
- 但 n8n / config-server 默认未暴露 `/metrics`
- 因此生产侧监控优先使用 `npm run probe` / `npm run probe:notify:send`

---

## 九、运维操作

### 8.1 查看服务状态

```bash
# 查看所有监控容器
cd monitoring && docker compose ps

# 查看日志
docker compose logs prometheus
docker compose logs grafana
```

### 8.2 重启服务

```bash
# 重启所有监控服务
cd monitoring && docker compose restart

# 重启单个服务
docker compose restart prometheus
```

### 8.3 数据持久化

| 服务 | Volume | 路径 |
|------|--------|------|
| Prometheus | prometheus_data | /prometheus |
| Grafana | grafana_data | /var/lib/grafana |

---

## 十、故障排查

### 9.1 Prometheus 无数据

1. 检查目标状态: http://localhost:9090/targets
2. 当前默认并无 `/metrics`：建议先跑 `npm run probe`
3. 若要使用 Prometheus：需要先实现并暴露 `/metrics`

### 9.2 Grafana 无法连接

1. 检查数据源配置
2. 确认 Prometheus 运行中
3. 使用 `http://prometheus:9090` (容器内部地址)

### 9.3 告警不触发

1. 检查告警规则语法
2. 确认 `for` 持续时间
3. 查看 Prometheus Alerts 页面
