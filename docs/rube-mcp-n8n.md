# 在 n8n 里用 Rube MCP 拉取/分析 X（Twitter）

你截图里给的配置方式（`https://rube.app/mcp` + 生成 `Authorization` token）对应 MCP 的 **Streamable HTTP** 传输：所有请求都用同一个 MCP endpoint，通过 HTTP `POST` 发送 JSON-RPC 消息。

> 关键点：Rube MCP 可以帮你“拿到 X 的内容/能力（tools）”。但**“写作/总结/判断价值”还是需要一个可程序化调用的 LLM**（OpenAI/Claude API 或本地模型）。ChatGPT Plus 网页版不能被 n8n 直接调用。

## 需要的东西
- `RUBE_MCP_URL`：`https://rube.app/mcp`
- `RUBE_AUTH_TOKEN`：在 Rube 的 “N8N & Others → Generate Token” 生成（放到 n8n 的环境变量或凭据里）
- （可选）`SLACK_CHANNEL_ID`：把结果发到 `#x-daily-pack` 时用

## n8n 调用 MCP 的请求规范（Streamable HTTP）
每条 MCP 消息都是一次新的 HTTP `POST`：
- Headers（每次都带）：
  - `Authorization: Bearer <RUBE_AUTH_TOKEN>`
  - `Content-Type: application/json`
  - `Accept: application/json, text/event-stream`
- 初始化成功后，后续请求还需要：
  - `MCP-Protocol-Version: <协商出的版本>`（来自 `initialize` 返回的 `result.protocolVersion`）
  - 如果初始化响应头里带了 `Mcp-Session-Id`，后续也要带：
    - `Mcp-Session-Id: <session id>`

## 推荐最小链路（先把 tools 跑通）
1) **HTTP Request：Rube Initialize**
   - Method: `POST`
   - URL: `{{$env.RUBE_MCP_URL}}`
   - Headers: 如上（先不带 `MCP-Protocol-Version` / `Mcp-Session-Id`）
   - Body（JSON）：
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "initialize",
     "params": {
       "protocolVersion": "2025-06-18",
       "capabilities": {},
       "clientInfo": { "name": "n8n", "version": "1.0.0" }
     }
   }
   ```
   - n8n 建议勾选 “Full Response/Include Headers”（名称因版本不同略有差异），确保能拿到响应头里的 `Mcp-Session-Id`。

2) **HTTP Request：Rube Initialized Notification**
   - Method: `POST`
   - URL: `{{$env.RUBE_MCP_URL}}`
   - Headers：
     - 同上
     - `MCP-Protocol-Version: {{$node["Rube Initialize"].json.body.result.protocolVersion}}`（按你的 n8n 实际字段路径调整）
     - `Mcp-Session-Id: {{$node["Rube Initialize"].json.headers["mcp-session-id"]}}`（如果有）
   - Body：
   ```json
   { "jsonrpc": "2.0", "method": "notifications/initialized" }
   ```
   - 该请求按规范通常会返回 `202 Accepted`（无 body）是正常的。

3) **HTTP Request：Rube Tools List**
   - Method: `POST`
   - Headers：同上（带 `MCP-Protocol-Version`，有 session 就带 session）
   - Body：
   ```json
   { "jsonrpc": "2.0", "id": 2, "method": "tools/list" }
   ```
   - 返回里会有 tool 名称和参数 schema。你把 `tools[].name` 发我，我就能把后续“抓 X 动态 → 打分筛选 → 写草稿”串起来。

## 抓取 X 的方式（取决于 Rube 暴露的 tool）
常见会有类似这些（示例，具体以 `tools/list` 为准）：
- `x.search`：按关键词/语句搜索
- `x.user_timeline`：按用户名拉时间线
- `x.list_timeline`：按 list 拉时间线

调用方式统一是：
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "<tool name>",
    "arguments": { "...": "..." }
  }
}
```

## SSE 返回的坑（n8n 可能遇到）
MCP 允许服务器对“请求”返回两种响应：
- `Content-Type: application/json`：一次性 JSON（最适合 n8n）
- `Content-Type: text/event-stream`：SSE 流（n8n 可能会把它当纯文本）

如果你发现 n8n 收到的是 SSE：
- 把 HTTP Request 的 Response Format 设成 `String`，用 Function 节点解析 `data: {json}` 行；
- 或者我给你加一个本地 “MCP→JSON” 小代理（Docker 起一个轻量服务，把 SSE 聚合成最终 JSON），n8n 调代理就行。

## 关于“不用 OpenAI API 只用 ChatGPT Plus”的现实结论
- **ChatGPT Plus 网页端没有官方定时任务/对外 API**，n8n 无法直接“调用你的 Plus”。  
- 你要全自动：要么用便宜 API（例如 `gpt-4o-mini` 这种量级），要么上本地模型（Ollama）。

把 `tools/list` 的结果（tool 名称列表）贴我，我就能把 `workflows/daily-pack.json` 升级成“RSS + X 一起选题”的版本，并把 X 侧的输入（关键词/白名单账号/名单）设计出来。

## 推荐的 X 搜索查询（近 7 天）
适合“AI 工具 / 智能体 / 工作流”主题，兼顾噪音控制和新鲜度：
- `("AI agent" OR "AI agents" OR "AI teammate") lang:en -is:retweet`
- `("autonomous agent" OR "auto agent" OR "workflow agent") ("launch" OR "shipping" OR "demo") lang:en -is:retweet`
- `("AI tool" OR "AI tools") ("released" OR "update" OR "v2") lang:en -is:retweet`
- `("RAG" OR "retrieval augmented") ("open source" OR "GitHub") lang:en -is:retweet`
- `("workflow automation" OR "ops automation") ("LLM" OR "GPT" OR "Claude") lang:en -is:retweet`
- `("evals" OR "benchmark") ("LLM" OR "model") lang:en -is:retweet`
- `("multimodal" OR "vision model") ("demo" OR "shipping") lang:en -is:retweet`
- `("prompt" OR "system prompt") ("leak" OR "analysis") lang:en -is:retweet`

可选中文流：
- `("AI 智能体" OR "智能体框架" OR "智能体平台") -is:retweet lang:zh`
- `("AI 工具" OR "AI 工作流") ("发布" OR "上线" OR "更新") -is:retweet lang:zh`

说明：
- 统一 `-is:retweet` 减少转推噪音；如需热门可去掉。
- 近 7 天直接用 `TWITTER_RECENT_SEARCH`，无需时间窗口参数；如要更精细，可加 `start_time` 为当前时间减 3 天。

## 推荐账号白名单（先关注/采集）
- 开发者/工具：`yoheinakajima`（AGI/agent 思考）、`simonw`（LLM 工具链）、`Karpathy`（模型/训练）、`yoheinakajima`、`hwchase17`（LangChain）、`omarsar0`（agentic）、`amasad`（Replit）、`ShreyaRamakr`（evals）。
- Infra/开源：`RecurseChat`、`exafunction`、`OpenPipeLabs`、`mckaywrigley`（工具 + 教程）。
- 中文：`lencx`、`eri`（开源工具/工作流）、`OpenCompass`（评测）、`硅基生`（多模态/模型动态）。

使用方式：
- 账号流：`from:username -is:retweet`；可多账号合并为一个查询，用 OR（需全大写）。
- 关键词流：用上面布尔表达式；如需去掉营销，可追加 `-giveaway -airdrop -job`.
