# X Daily Pack - 安全指南

**版本**: v2.0
**最后更新**: 2026-01-25

---

## 一、安全架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    安全防护层                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  外部请求 ──→ [Webhook Auth] ──→ n8n 工作流                 │
│                                                             │
│  API 请求 ──→ [API Key Auth] ──→ Config Server              │
│                                                             │
│  n8n 节点 ──→ [Env Isolation] ──→ 禁止访问环境变量          │
│                                                             │
│  代码提交 ──→ [CI Security] ──→ Snyk + Semgrep 扫描         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、认证机制

### 2.1 Webhook 认证

**方式**: Header Auth
**Header**: `X-Webhook-Secret`

```bash
# 触发 Webhook 示例
curl -X POST https://your-n8n.com/webhook/daily-pack \
  -H "X-Webhook-Secret: your-secret-here" \
  -H "Content-Type: application/json"
```

**配置位置**:
- `.env`: `WEBHOOK_SECRET=your-secret`
- n8n Credential: Header Auth 类型

### 2.2 Config Server 认证

**方式**: API Key
**Header**: `X-API-Key`

```bash
# 访问 Config Server 示例
curl http://localhost:3001/config \
  -H "X-API-Key: your-api-key"
```

**配置位置**: `.env`: `CONFIG_API_KEY=your-key`

---

## 三、环境变量隔离

### 3.1 n8n 节点隔离

**配置**: `N8N_BLOCK_ENV_ACCESS_IN_NODE=true`

**效果**: 禁止 Code 节点通过 `process.env` 访问环境变量

**位置**: `docker-compose.yml`

```yaml
environment:
  - N8N_BLOCK_ENV_ACCESS_IN_NODE=true
```

### 3.2 CORS 限制

**配置**: `ALLOWED_ORIGINS=https://your-domain.com`

**效果**: 限制跨域请求来源

---

## 四、密钥管理

### 4.1 密钥清单

| 密钥 | 用途 | 存储位置 |
|------|------|----------|
| WEBHOOK_SECRET | Webhook 认证 | .env + n8n |
| CONFIG_API_KEY | Config Server | .env |
| OPENAI_API_KEY | OpenAI API | .env |
| SLACK_BOT_TOKEN | Slack 推送 | .env |
| TELEGRAM_BOT_TOKEN | Telegram 推送 | .env |

### 4.2 密钥规范

- `.env` 已在 `.gitignore` 中忽略
- 文档中禁止粘贴真实密钥
- 示例使用占位符（`sk-...`、`xoxb-...`）

---

## 五、Slack 权限边界

### 5.1 最小权限集

| 权限 | 用途 |
|------|------|
| chat:write | 发送消息 |
| chat:write.public | 发送到公开频道 |
| channels:history | 读取频道历史 |
| channels:read | 读取频道信息 |

### 5.2 注意事项

- 机器人必须被邀请进目标频道
- 否则会报 `not_in_channel` 错误

---

## 六、CI/CD 安全扫描

### 6.1 集成工具

| 工具 | 用途 | 触发时机 |
|------|------|----------|
| Snyk | 依赖漏洞扫描 | PR / Push |
| Semgrep | 代码安全分析 | PR / Push |
| npm audit | 包安全检查 | npm install |

### 6.2 配置位置

`.github/workflows/test.yml`

---

## 七、内容风险管理

### 7.1 发布开关

| 配置 | 值 | 效果 |
|------|-----|------|
| X_WRITE_ENABLED | false | Dry-run 模式 |
| X_WRITE_ENABLED | true | 真实发布 |

**建议**: 先 dry-run 跑通一周，再开启写入

### 7.2 内容过滤

- Blocklist: 攻击性/歧视性词汇过滤
- Fallback: 备用文案机制
- 人工审核: Slack 审批流程

---

## 八、安全检查清单

### 部署前检查

- [ ] `.env` 文件已配置所有密钥
- [ ] `WEBHOOK_SECRET` 已设置强密码
- [ ] `CONFIG_API_KEY` 已设置强密码
- [ ] `N8N_BLOCK_ENV_ACCESS_IN_NODE=true`
- [ ] `ALLOWED_ORIGINS` 已限制域名
- [ ] n8n Credential 已创建

### 运行时检查

- [ ] Webhook 认证正常工作
- [ ] Config Server 认证正常工作
- [ ] CI 安全扫描通过
- [ ] npm audit 无高危漏洞