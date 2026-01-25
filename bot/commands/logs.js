/**
 * /logs 命令 - 查看日志
 */
import { executeCommand } from '../utils/executor.js';

export async function logsCommand(ctx) {
  const args = ctx.message.text.split(' ').slice(1);
  const target = args[0] || 'n8n';

  await ctx.reply(`⏳ 获取 ${target} 日志...`);

  try {
    let output;
    switch (target) {
      case 'n8n':
        output = await executeCommand('docker compose logs --tail=20 n8n');
        break;
      case 'bot':
        output = await executeCommand('pm2 logs telegram-bot --lines 20 --nostream 2>/dev/null || echo "Bot not running with PM2"');
        break;
      default:
        return ctx.reply('❌ 可用: n8n, bot');
    }

    await ctx.reply(`📜 *${target} 日志*\n\`\`\`\n${output}\n\`\`\``, { parse_mode: 'Markdown' });
  } catch (err) {
    await ctx.reply(`❌ 获取失败: ${err.stderr || err.message}`);
  }
}
