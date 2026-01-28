# History (What happened, and why)

本文件记录关键里程碑与“踩坑/修复”历史，便于未来会话快速定位上下文。

## 2026-01-26 ~ 2026-01-27：运行态修复与运维固化

### 症状：到点/手动触发时偶发“没有消息”

定位到三类主因：
1) 调度漂移（live cron 与仓库不一致）  
2) Code node runner 请求排队超时（60s timeout）  
3) Config Server 开启 API Key，但调用端未带 `X-API-Key`

### 关键修复与固化动作

- 调度与代码节点“脚本化管理”：
  - 新增：`deploy_daily_pack.py` / `drift_check_daily_pack.py` / `probe_daily_pack.py` / `trigger_daily_pack.py`
  - 固化为 npm 入口：`npm run deploy` / `npm run drift-check` / `npm run probe` / `npm run trigger:webhook`
- 可观测性主入口转为探针：
  - 新增：`probe_daily_pack_notify.py`（去重 + 冷却窗口）
  - 建议 cron：`npm run probe:notify:send`
- 稳定性改造（不改变主流程语义）：
  - Config Server 调用补齐 `X-API-Key`
  - `Multi News API` 收敛超时/重试并加入强降级护栏（可调）
  - runner 请求等待超时提升为 300s（`N8N_RUNNERS_TASK_REQUEST_TIMEOUT=300`）
- 文档对齐：
  - 新增并推广 `docs/RUNBOOK.md`
  - 入口文档统一指向 runbook + npm 脚本

### 当前已知未完成项（仍需跟踪）

- 建议轮换：`WEBHOOK_SECRET`（建议同时轮换 `N8N_API_KEY`）
- 安全基线迁移：`N8N_BLOCK_ENV_ACCESS_IN_NODE=true` 仍未落地（$env 依赖较多）

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
