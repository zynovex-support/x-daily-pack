/**
 * Telegram Remote Bot - 入口文件
 */
import { Telegraf } from 'telegraf';
import { config } from './config.js';
import { authMiddleware } from './middleware/auth.js';
import { statusCommand } from './commands/status.js';
import { gitCommand } from './commands/git.js';
import { testCommand } from './commands/test.js';
import { dockerCommand } from './commands/docker.js';
import { workflowCommand } from './commands/workflow.js';
import { logsCommand } from './commands/logs.js';

// 验证配置
if (!config.token) {
  console.error('❌ TELEGRAM_BOT_TOKEN not set');
  process.exit(1);
}

if (config.allowedUsers.length === 0) {
  console.error('❌ ALLOWED_USER_IDS not set');
  process.exit(1);
}

const bot = new Telegraf(config.token);

// 认证中间件
bot.use(authMiddleware);

// 基础命令
bot.start((ctx) => ctx.reply(`👋 欢迎使用 X Daily Pack Bot

使用 /help 查看可用命令`));

bot.help((ctx) => ctx.reply(`📖 *可用命令*

/status - 系统状态
/git <status|pull|log> - Git 操作
/test <unit|all> - 运行测试
/docker <ps|logs|restart> - Docker
/workflow trigger - 触发工作流
/logs <n8n|bot> - 查看日志`, { parse_mode: 'Markdown' }));

// 功能命令
bot.command('status', statusCommand);
bot.command('git', gitCommand);
bot.command('test', testCommand);
bot.command('docker', dockerCommand);
bot.command('workflow', workflowCommand);
bot.command('logs', logsCommand);

// 启动
bot.launch();
console.log('🤖 Telegram Bot started');
console.log(`📋 Allowed users: ${config.allowedUsers.join(', ')}`);

// 优雅退出
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
