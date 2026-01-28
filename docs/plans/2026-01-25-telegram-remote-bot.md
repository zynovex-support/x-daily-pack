# Telegram Remote Bot 远程触发方案

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 通过 Telegram Bot 远程触发 Claude Code 任务，实现随时随地管理开发工作

**Architecture:** Node.js + Telegraf 框架，白名单命令模式，与现有 x-daily-pack 项目集成

**Tech Stack:** Telegraf, Node.js 18+, child_process, PM2

---

## 状态更新（2026-01-27）

- 当前生产环境使用 `TELEGRAM_DAILY_BOT_TOKEN` / `TELEGRAM_DAILY_CHAT_ID`
- 本文档为历史方案，涉及旧变量名时请以 daily 变量名为准

---

## 一、需求分析

### 1.1 使用场景

| 场景 | 描述 | 优先级 |
|------|------|--------|
| 远程查看状态 | 手机查看项目状态、Git 状态、Docker 状态 | P0 |
| 触发测试 | 远程运行测试套件 | P0 |
| 触发工作流 | 手动触发 n8n 工作流 | P1 |
| 查看日志 | 查看最近的错误日志 | P1 |
| 简单 Git 操作 | git pull, git status | P2 |
| Claude Code 交互 | 发送任务给 Claude Code | P2 |

### 1.2 用户环境

```
Win11 Host
    └── VMware
        └── Linux VM
            ├── Claude Code / Codex
            ├── n8n (Docker)
            ├── x-daily-pack 项目
            └── Telegram Bot (新增)
```

### 1.3 核心需求

1. **安全性**: 只允许特定用户操作
2. **可靠性**: 7x24 运行，自动重启
3. **可扩展**: 易于添加新命令
4. **集成性**: 与现有项目无缝集成

---

## 二、技术选型

### 2.1 框架对比

| 框架 | 优点 | 缺点 | 选择 |
|------|------|------|------|
| **Telegraf** | 最流行、中间件架构、TypeScript 支持 | 学习曲线稍高 | ✅ 推荐 |
| grammY | 轻量、适合 serverless | 社区较小 | |
| node-telegram-bot-api | 简单 | 功能较少 | |

### 2.2 部署方式

| 方式 | 优点 | 缺点 | 选择 |
|------|------|------|------|
| **Long Polling** | 简单、无需公网 IP | 延迟稍高 | ✅ 推荐 |
| Webhook | 低延迟 | 需要公网 IP + HTTPS | |

### 2.3 进程管理

| 工具 | 优点 | 选择 |
|------|------|------|
| **PM2** | 自动重启、日志管理、监控 | ✅ 推荐 |
| systemd | 系统级 | 备选 |

---

## 三、架构设计

### 3.1 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Telegram Remote Bot                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Telegram App (手机/桌面)                                    │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────────┐                                        │
│  │  Telegram API   │                                        │
│  └────────┬────────┘                                        │
│           │ Long Polling                                    │
│           ▼                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Bot Server (Node.js)                    │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────────┐   │   │
│  │  │ Auth      │  │ Command   │  │ Executor      │   │   │
│  │  │ Middleware│→ │ Router    │→ │ (child_process│   │   │
│  │  └───────────┘  └───────────┘  └───────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│           │                                                 │
│           ▼                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Local System                            │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐             │   │
│  │  │ Shell   │  │ Docker  │  │ Claude  │             │   │
│  │  │ Commands│  │ n8n     │  │ Code    │             │   │
│  │  └─────────┘  └─────────┘  └─────────┘             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 目录结构

```
x-daily-pack/
├── bot/                          # Telegram Bot 模块
│   ├── index.js                  # 入口文件
│   ├── config.js                 # 配置管理
│   ├── middleware/
│   │   ├── auth.js               # 用户认证
│   │   └── logger.js             # 日志记录
│   ├── commands/
│   │   ├── status.js             # /status 命令
│   │   ├── test.js               # /test 命令
│   │   ├── git.js                # /git 命令
│   │   ├── docker.js             # /docker 命令
│   │   ├── workflow.js           # /workflow 命令
│   │   └── claude.js             # /claude 命令
│   └── utils/
│       ├── executor.js           # 命令执行器
│       └── formatter.js          # 输出格式化
├── ecosystem.config.js           # PM2 配置
└── ...
```

---

## 四、安全策略

### 4.1 多层防护

```
Layer 1: 用户白名单 (Telegram User ID)
    │
    ▼
Layer 2: 命令白名单 (预定义命令)
    │
    ▼
Layer 3: 参数验证 (输入过滤)
    │
    ▼
Layer 4: 执行隔离 (非 root 运行)
    │
    ▼
Layer 5: 输出限制 (防止敏感信息泄露)
```

### 4.2 安全配置

| 配置项 | 说明 | 示例 |
|--------|------|------|
| TELEGRAM_DAILY_BOT_TOKEN | Bot Token | 从 BotFather 获取 |
| ALLOWED_USER_IDS | 允许的用户 ID | 123456789,987654321 |
| MAX_OUTPUT_LENGTH | 最大输出长度 | 4000 |
| COMMAND_TIMEOUT | 命令超时 | 60000 (ms) |

### 4.3 禁止的操作

- ❌ 任意 shell 命令执行
- ❌ 文件删除操作
- ❌ 系统配置修改
- ❌ 密钥/密码显示
- ❌ root 权限操作

---

## 五、功能规划

### 5.1 命令列表

| 命令 | 功能 | 参数 | 示例 |
|------|------|------|------|
| `/start` | 欢迎信息 | - | `/start` |
| `/help` | 帮助信息 | - | `/help` |
| `/status` | 系统状态 | - | `/status` |
| `/git` | Git 操作 | status/pull/log | `/git status` |
| `/test` | 运行测试 | unit/all | `/test unit` |
| `/docker` | Docker 状态 | ps/logs | `/docker ps` |
| `/workflow` | 触发工作流 | trigger | `/workflow trigger` |
| `/logs` | 查看日志 | n8n/bot | `/logs n8n` |

### 5.2 交互设计

```
用户: /status

Bot: 📊 系统状态

🖥️ 系统
• CPU: 23%
• 内存: 4.2GB / 8GB
• 磁盘: 45GB / 100GB

🐳 Docker
• n8n: ✅ Running
• postgres: ✅ Running

📦 Git
• 分支: main
• 状态: clean
• 最新提交: ae4eb6b (2h ago)

⏰ 更新时间: 2026-01-25 19:30:00
```

---

## 六、实施计划

### Phase 1: 基础框架 (Task 1-4)

### Task 1: 创建 Bot 配置

**Files:**
- Create: `bot/config.js`

**Step 1: 创建配置文件**

```javascript
// bot/config.js
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  token: process.env.TELEGRAM_DAILY_BOT_TOKEN,
  allowedUsers: (process.env.ALLOWED_USER_IDS || '')
    .split(',')
    .map(id => parseInt(id.trim()))
    .filter(id => !isNaN(id)),
  maxOutputLength: parseInt(process.env.MAX_OUTPUT_LENGTH) || 4000,
  commandTimeout: parseInt(process.env.COMMAND_TIMEOUT) || 60000,
  projectRoot: process.env.PROJECT_ROOT || '/home/henry/x'
};
```

**Step 2: 更新 .env.example**

添加:
```
TELEGRAM_DAILY_BOT_TOKEN=your-bot-token
ALLOWED_USER_IDS=123456789
MAX_OUTPUT_LENGTH=4000
COMMAND_TIMEOUT=60000
PROJECT_ROOT=/home/henry/x
```

---

### Task 2: 创建认证中间件

**Files:**
- Create: `bot/middleware/auth.js`

**Step 1: 创建认证中间件**

```javascript
// bot/middleware/auth.js
import { config } from '../config.js';

export function authMiddleware(ctx, next) {
  const userId = ctx.from?.id;

  if (!userId || !config.allowedUsers.includes(userId)) {
    console.log(`Unauthorized access attempt: ${userId}`);
    return ctx.reply('⛔ 未授权访问');
  }

  return next();
}
```

---

### Task 3: 创建命令执行器

**Files:**
- Create: `bot/utils/executor.js`

**Step 1: 创建执行器**

```javascript
// bot/utils/executor.js
import { exec } from 'child_process';
import { config } from '../config.js';

export function executeCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout || config.commandTimeout;
    const cwd = options.cwd || config.projectRoot;

    exec(command, { cwd, timeout }, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stderr });
        return;
      }

      let output = stdout || stderr;
      if (output.length > config.maxOutputLength) {
        output = output.slice(0, config.maxOutputLength) + '\n... (truncated)';
      }

      resolve(output);
    });
  });
}
```

---

### Task 4: 创建 Bot 入口

**Files:**
- Create: `bot/index.js`

**Step 1: 创建入口文件**

```javascript
// bot/index.js
import { Telegraf } from 'telegraf';
import { config } from './config.js';
import { authMiddleware } from './middleware/auth.js';

const bot = new Telegraf(config.token);

// 认证中间件
bot.use(authMiddleware);

// 基础命令
bot.start((ctx) => ctx.reply('👋 欢迎使用 X Daily Pack Bot\n\n使用 /help 查看可用命令'));
bot.help((ctx) => ctx.reply(`📖 可用命令:

/status - 系统状态
/git <status|pull|log> - Git 操作
/test <unit|all> - 运行测试
/docker <ps|logs> - Docker 状态
/workflow trigger - 触发工作流
/logs <n8n|bot> - 查看日志`));

// 启动
bot.launch();
console.log('🤖 Bot started');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
```

---

### Phase 2: 核心命令 (Task 5-8)

### Task 5: 实现 /status 命令

**Files:**
- Create: `bot/commands/status.js`

**功能:** 显示系统状态 (CPU/内存/磁盘/Docker/Git)

---

### Task 6: 实现 /git 命令

**Files:**
- Create: `bot/commands/git.js`

**功能:** git status, git pull, git log

---

### Task 7: 实现 /test 命令

**Files:**
- Create: `bot/commands/test.js`

**功能:** npm test, npm run test:unit

---

### Task 8: 实现 /docker 命令

**Files:**
- Create: `bot/commands/docker.js`

**功能:** docker compose ps, docker compose logs

---

### Phase 3: 高级功能 (Task 9-11)

### Task 9: 实现 /workflow 命令

**Files:**
- Create: `bot/commands/workflow.js`

**功能:** 触发 n8n 工作流 (通过 Webhook)

---

### Task 10: 实现 /logs 命令

**Files:**
- Create: `bot/commands/logs.js`

**功能:** 查看最近日志

---

### Task 11: PM2 部署配置

**Files:**
- Create: `ecosystem.config.js`

**功能:** PM2 进程管理配置

---

### Phase 4: 测试与文档 (Task 12-13)

### Task 12: 编写测试

**Files:**
- Create: `tests/suites/unit/bot.test.ts`

---

### Task 13: 更新文档

**Files:**
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`
- Modify: `README.md`

---

## 七、环境准备

### 7.1 创建 Telegram Bot

1. 打开 Telegram，搜索 `@BotFather`
2. 发送 `/newbot`
3. 输入 Bot 名称: `X Daily Pack Bot`
4. 输入 Bot 用户名: `xdailypack_bot` (需唯一)
5. 保存返回的 Token

### 7.2 获取用户 ID

1. 搜索 `@userinfobot`
2. 发送任意消息
3. 记录返回的 User ID

### 7.3 安装依赖

```bash
npm install telegraf
npm install -g pm2
```

---

## 八、参考资源

- [Telegraf 文档](https://telegraf.js.org/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [PM2 文档](https://pm2.keymetrics.io/)

---

## 九、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Token 泄露 | 高 | .env 存储，不提交 Git |
| 命令注入 | 高 | 白名单命令，参数验证 |
| 服务中断 | 中 | PM2 自动重启 |
| 输出泄露 | 中 | 长度限制，敏感过滤 |

---

**方案完成时间**: 2026-01-25
**预计实施**: 13 个 Task
