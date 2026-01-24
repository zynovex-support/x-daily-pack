# History (What happened, and why)

本文件记录关键里程碑与“踩坑/修复”历史，便于未来会话快速定位上下文。

## 2026-01-18：项目启动与方案确定

- 决策：使用 Slack 私密频道 `#x-daily-pack` 承载每日 pack（便于复盘与协作）。
- 决策：使用 n8n 本地 Docker 自托管（真免费 + 易迁移）。

## 2026-01-18：n8n 本地自托管落地

### 问题 1：`the input device is not a TTY`
- 原因：在非交互环境使用 `docker run -it`。
- 解决：改为后台 `docker run -d`。

### 问题 2：n8n 无法启动，报 `EACCES ... /home/node/.n8n/config`
- 原因：宿主目录 `~/.n8n` 被 root 拥有。
- 解决：`sudo chown -R $(id -u):$(id -g) ~/.n8n` 后重启容器。

### 问题 3：UI 访问异常（404/无法打开）
- 事实：`curl` 对某些路径可能返回 404，但 UI 前端路由在浏览器可用；最终以 `curl -I http://localhost:5678/` 返回 200 作为可用性判断。

## 2026-01-18：Slack 集成落地

- 选择 Credential：使用 Slack Bot Token（Access Token/API Token 方式），而不是 OAuth2。
- 验证：成功发出测试消息到 `#x-daily-pack`。

## 2026-01-19：审批发布链路根因定位与修复

### 症状：在 Slack 回复 `post 1` 后没有发推

根因组合：
1) 命令发在频道顶层而非线程，旧逻辑仅扫描线程回复；  
2) 容器未使用 `--env-file` 注入 `.env`，导致 `X_WRITE_ENABLED` 实际未生效（一直 dry-run）。

修复：
- 审批逻辑增强：支持频道顶层命令并自动映射到最近 pack；加入命令时效窗口与幂等 ack。
- 运行方式修正：用 `--env-file /home/henry/x/.env` 重建 `n8n-local`，确保环境变量生效。

验证：
- Slack 线程回帖显示 “已发布 Option N” 并包含 Rube MCP 返回（tweet id）。

## 2026-01-19：信息源调研与质量争议

- 引入多份 Perplexity 输出报告（文件在仓库根目录，见 `docs/ASSETS.md`）。
- 发现问题：报告可能混淆 “网页 403 / RSS 可用性 / 站点是否关停”，且大量条目缺乏可执行验证。
- 决策：后续源头策略以“可复现审计表”（脚本/抽样）为准，避免单次 LLM 报告误导。

