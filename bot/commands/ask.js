/**
 * /ask 命令 - 智能问答
 * /ask - 快速模式 (API + 项目上下文)
 * /askx - 深度模式 (Codex CLI)
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, unlink } from 'fs/promises';
import { config } from '../config.js';

const execAsync = promisify(exec);

// 项目上下文摘要
const PROJECT_CONTEXT = `你是 X Daily Pack 项目的 AI 助手。

项目概述：AI 行业日报自动化系统
- 数据采集：34个RSS源 + 6个新闻API + X/Twitter搜索
- 处理流程：采集 → 标准化 → URL去重 → 语义去重 → 事件聚类 → LLM评分 → 推送
- 工作流引擎：n8n (18节点主流程 + 4节点审批流程)
- 推送渠道：Slack/Telegram 审批后发布到 X/Twitter

技术栈：
- 语义去重：Embedding + 余弦相似度 (阈值0.85)
- 事件聚类：DBSCAN (eps=0.25, minPts=2)
- LLM评分：timeliness/impact/actionability/relevance 多维度
- 监控：Prometheus + Grafana

关键文件：
- workflows/daily-pack-v5-fixed.json - 主工作流
- scripts/event-clustering-node.js - 事件聚类
- scripts/llm-rank-node.js - LLM评分
- bot/ - Telegram Bot

请用中文简洁回答用户问题。`;

/**
 * 快速模式：直接 API 调用
 */
async function callAPI(question) {
  const apiUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  const apiKey = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('未配置 API Key');
  }

  const response = await fetch(`${apiUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: PROJECT_CONTEXT,
      messages: [{ role: 'user', content: question }]
    }),
    signal: AbortSignal.timeout(60000)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API 错误: ${response.status}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

/**
 * 深度模式：Codex CLI
 */
async function callCodexCLI(question, cwd) {
  const codexPath = '/home/henry/.nvm/versions/node/v22.21.0/bin/codex';
  const outputFile = `/tmp/codex-${Date.now()}.txt`;
  const cmd = `${codexPath} exec "${question.replace(/"/g, '\\"')}" -o ${outputFile}`;

  await execAsync(cmd, {
    cwd,
    timeout: 180000,
    maxBuffer: 10 * 1024 * 1024
  });

  const result = await readFile(outputFile, 'utf-8');
  await unlink(outputFile).catch(() => {});
  return result.trim();
}

/**
 * 分割长消息
 */
function splitMessage(text, maxLength = 4000) {
  if (text.length <= maxLength) return [text];

  const parts = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      parts.push(remaining);
      break;
    }

    let splitIndex = remaining.lastIndexOf('\n', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = maxLength;
    }

    parts.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trimStart();
  }

  return parts;
}

/**
 * /ask - 快速模式
 */
export async function askCommand(ctx) {
  const text = ctx.message.text || '';
  const question = text.replace(/^\/ask\s*/, '').trim();

  if (!question) {
    await ctx.reply(
      '📝 用法: /ask <问题>\n\n' +
      '快速模式，2-5秒响应\n' +
      '深度模式用 /askx'
    );
    return;
  }

  const waitMsg = await ctx.reply('🤔 思考中...');

  try {
    const answer = await callAPI(question);
    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});

    const parts = splitMessage(answer);
    for (const part of parts) {
      await ctx.reply(part);
    }
  } catch (err) {
    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
    await ctx.reply(`❌ 失败: ${err.message}`);
  }
}

/**
 * /askx - 深度模式
 */
export async function askxCommand(ctx) {
  const text = ctx.message.text || '';
  const question = text.replace(/^\/askx\s*/, '').trim();

  if (!question) {
    await ctx.reply(
      '📝 用法: /askx <问题>\n\n' +
      '深度模式，30-60秒响应\n' +
      '可读取项目文件'
    );
    return;
  }

  const waitMsg = await ctx.reply('🔍 深度分析中（约30-60秒）...');

  try {
    const answer = await callCodexCLI(question, config.projectDir);
    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});

    const parts = splitMessage(answer);
    for (const part of parts) {
      await ctx.reply(part);
    }
  } catch (err) {
    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});

    let msg = err.message;
    if (err.killed) msg = '超时，问题太复杂';
    await ctx.reply(`❌ 失败: ${msg}`);
  }
}
