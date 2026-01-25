# /ask 智能问答命令实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现 Telegram Bot 的 `/ask` 命令，通过 Claude Code CLI 非交互模式回答项目相关问题

**Architecture:** 用户发送 `/ask <问题>` → Bot 调用 Claude Code CLI (`claude -p`) → 返回 AI 回答

**Tech Stack:** Telegraf, Node.js child_process, Claude Code CLI

---

## 技术调研结果

### Claude Code CLI 关键参数

```bash
claude -p "问题"                    # 非交互模式，输出后退出
  --output-format text              # 纯文本输出（适合 Telegram）
  --permission-mode default         # 默认权限模式
  --max-budget-usd 0.5              # 单次查询成本上限
  -c                                # 继续上次对话（可选）
```

### 设计决策

| 决策点 | 选择 | 原因 |
|--------|------|------|
| 输出格式 | text | Telegram 消息友好 |
| 权限模式 | default | 安全，不自动执行危险操作 |
| 成本控制 | 0.5 USD/次 | 防止意外高消费 |
| 超时时间 | 120秒 | Claude 回答可能较长 |
| 工作目录 | /home/henry/x | 项目上下文 |

---

## 实现任务

### Task 1: 创建 ask 命令模块

**Files:**
- Create: `bot/commands/ask.js`

**Step 1: 创建基础命令结构**

```javascript
/**
 * /ask 命令 - 智能问答
 * 调用 Claude Code CLI 回答项目相关问题
 */
import { spawn } from 'child_process';
import { config } from '../config.js';

export async function askCommand(ctx) {
  // 提取问题
  const text = ctx.message.text || '';
  const question = text.replace(/^\/ask\s*/, '').trim();

  if (!question) {
    await ctx.reply('📝 用法: /ask <你的问题>\n\n示例:\n/ask 项目的主要功能是什么？\n/ask 如何运行测试？');
    return;
  }

  // 发送等待消息
  const waitMsg = await ctx.reply('🤔 正在思考...');

  // 调用 Claude Code CLI
  // ... 实现见 Step 2
}
```

**Step 2: 实现 Claude Code CLI 调用**

```javascript
async function callClaude(question, cwd) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p', question,
      '--output-format', 'text',
      '--permission-mode', 'default',
      '--max-budget-usd', '0.5'
    ];

    const proc = spawn('claude', args, {
      cwd,
      timeout: 120000,
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr += data; });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr || `Exit code: ${code}`));
      }
    });

    proc.on('error', reject);
  });
}
```

**Step 3: 完成命令处理逻辑**

添加错误处理和消息分割（Telegram 消息限制 4096 字符）。

---

### Task 2: 注册命令到 Bot

**Files:**
- Modify: `bot/index.js`

**Step 1: 导入 ask 命令**

```javascript
import { askCommand } from './commands/ask.js';
```

**Step 2: 注册命令**

```javascript
bot.command('ask', askCommand);
```

---

### Task 3: 更新配置

**Files:**
- Modify: `bot/config.js`

**Step 1: 添加 ask 相关配置**

```javascript
export const config = {
  // ... 现有配置
  ask: {
    timeout: 120000,        // 2分钟超时
    maxBudget: 0.5,         // 单次最大成本
    maxResponseLength: 4000 // Telegram 消息长度限制
  }
};
```

---

### Task 4: 测试

**Step 1: 重启 Bot**

```bash
pm2 restart telegram-bot
```

**Step 2: 测试命令**

在 Telegram 中测试:
- `/ask` - 应显示帮助
- `/ask 项目的主要功能是什么？` - 应返回 AI 回答
- `/ask 如何运行测试？` - 应返回测试相关信息

---

### Task 5: 提交代码

```bash
git add bot/commands/ask.js bot/index.js bot/config.js
git commit -m "feat(bot): add /ask smart Q&A command with Claude Code CLI"
```

---

## 安全考虑

1. **成本控制**: `--max-budget-usd 0.5` 限制单次查询成本
2. **权限模式**: `default` 模式不会自动执行危险操作
3. **用户白名单**: 已有 auth 中间件限制访问
4. **超时保护**: 120秒超时防止长时间阻塞

## 后续优化（可选）

- [ ] 会话上下文: 使用 `--session-id` 保持对话连续性
- [ ] 流式输出: 使用 `stream-json` 实时显示回答
- [ ] 历史记录: 保存问答历史供回顾
