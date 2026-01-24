# Security

## 1) 密钥管理

- `.env` 存放本地/自托管所需密钥（OpenAI/Slack/Rube 等），并已在 `.gitignore` 中忽略。  
- 任何文档中禁止粘贴真实密钥；示例一律用占位符（`sk-...`、`xoxb-...`）。

## 2) Slack 权限边界

建议最小权限集（Bot Token Scopes）：
- `chat:write`
- `chat:write.public`（如需发到公开频道；私密频道通常不需要，但保留可减少误配置）
- 轮询与读取线程所需（用于审批流程）：
  - `channels:history`, `channels:read`
  - `groups:history`, `groups:read`（私密频道）

机器人必须被邀请进 `#x-daily-pack`，否则会报 `not_in_channel`/`channel_not_found`。

## 3) 发布开关与风控

- `X_WRITE_ENABLED=false`（默认建议）：
  - 审批流程只做 dry-run，并在 Slack 线程回帖展示将发布的文本
- `X_WRITE_ENABLED=true`：
  - 审批流程会调用 Rube MCP 的 X 发布工具（真实发推）

建议流程：先 dry-run 跑通一周，再开启写入。

## 4) 内容风险

- 草稿生成有 blocklist（攻击性/歧视性词汇）与 fallback 文案，降低“引战/冒犯”风险。  
- 默认禁用 X/Twitter 链接（避免引用带来争议与不稳定性）。  
- 推荐在 Slack 审阅时加入额外人工检查：是否涉及隐私、未经证实的指控、敏感政治/医疗内容等。

