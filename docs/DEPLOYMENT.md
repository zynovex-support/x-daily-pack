# 部署指南

> 最新运维入口：`docs/RUNBOOK.md`

## 第一步：获取必需的 API Keys

### 1.1 OpenAI API Key

1. 访问 https://platform.openai.com/api-keys
2. 登录你的 OpenAI 账号
3. 点击 "Create new secret key"
4. 复制 key（例如：`<your-openai-api-key>`）
5. 充值至少 $5-10（用于测试）

**预估成本**：每天运行一次约 $0.10-0.50

### 1.2 Slack Bot Token

1. 访问 https://api.slack.com/apps
2. 点击 "Create New App" → "From scratch"
3. 输入 App Name: "X Daily Pack Bot"
4. 选择你的 Workspace
5. 进入 "OAuth & Permissions"
6. 添加 Bot Token Scopes:
   - `chat:write`
   - `chat:write.public`
   - （用于审批轮询）`channels:read`, `channels:history`, `groups:read`, `groups:history`
7. 点击 "Install to Workspace"
8. 复制 "Bot User OAuth Token"（例如：`<your-slack-bot-token>`）

### 1.3 Slack Channel ID

1. 在 Slack 中创建私密频道 `#x-daily-pack`
2. 右键频道名 → "View channel details"
3. 在底部找到 Channel ID（格式：`C...`）
4. 复制 Channel ID

### 1.4 Rube MCP Token

1. 打开 https://rube.app/mcp
2. 进入 "N8N & Others" 页面
3. 点击 "Generate Token"
4. 复制 `Authorization: Bearer <token>` 中的 token

## 第二步：配置环境变量

```bash
cd /home/henry/x
cp .env.example .env
nano .env
```

填入你的 keys：
```
OPENAI_API_KEY=<your-openai-api-key>
SLACK_BOT_TOKEN=<your-slack-bot-token>
SLACK_CHANNEL_ID=<your-slack-channel-id>
RUBE_MCP_URL=https://rube.app/mcp
RUBE_AUTH_TOKEN=your-rube-token-here
```

## 第三步：启动 n8n

```bash
cd /home/henry/x
docker compose up -d
docker compose ps
```

验证启动：
```bash
docker compose logs --tail 100 n8n
```

## 第四步：导入 Workflow

1. 访问 http://localhost:5678
2. 首次访问会要求创建账号
3. 登录后，点击左侧 "Workflows"
4. 点击 "Import from File"
5. 选择 `/home/henry/x/workflows/daily-pack-v5-fixed.json`
6. Workflow 导入成功
7. （可选）再导入 `/home/henry/x/workflows/slack-approvals.json` 用于审批后自动发布

## 第五步：配置 Workflow

在 n8n 中：
1. 打开导入的 workflow
2. 点击 "Set Config Variables" 节点
3. 确认环境变量正确读取
4. 保存 workflow

## 第六步：测试运行

推荐使用脚本做 API/日志级验证（可重复自动化）：

```bash
npm run deploy
npm run drift-check
npm run probe
npm run trigger:webhook
```

如果你仍想在 UI 中手动执行：
1. 点击 "Execute Workflow" 按钮
2. 查看执行结果
3. 检查 Slack 频道是否收到消息

## 第七步：Slack 审批发布（可选）

默认情况下审批工作流只会 dry-run（不会真的发推），用于安全验证。

1. 在 `.env` 中设置：`X_WRITE_ENABLED=true`
2. 重启 n8n 容器（确保加载最新环境变量）
3. 在 Slack 的 pack 消息线程内回复：`post 1` / `post 2` / `post 3`
4. 审批工作流会在同一线程回复执行结果

## 故障排查

### 问题：n8n 无法读取环境变量
**解决**：确保 `docker compose up -d` 且 `.env` 已存在

### 问题：Slack 消息发送失败
**解决**：
1. 检查 Bot Token 是否正确
2. 确认 Bot 已被邀请到频道
3. 检查 Bot 权限是否包含 `chat:write`
4. 运行 `npm run probe` 查看 `slack_last_success_ok` 与 `message_ts`

---

## 生产运行推荐顺序（固定流程）

```bash
cd /home/henry/x
docker compose up -d

npm run deploy
npm run drift-check
npm run probe
npm run trigger:webhook
```

### 问题：OpenAI API 调用失败
**解决**：
1. 检查 API Key 是否正确
2. 确认账户有余额
3. 检查网络连接

## 下一步

建议先在 n8n 中单次执行，确认：
1. Rube MCP 能正常返回 X 搜索结果
2. LLM 评分与推文生成可用
3. Slack 频道收到 Block Kit
