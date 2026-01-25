/**
 * /docker 命令 - Docker 状态
 */
import { executeCommand } from '../utils/executor.js';

export async function dockerCommand(ctx) {
  const args = ctx.message.text.split(' ').slice(1);
  const subcommand = args[0] || 'ps';

  await ctx.reply(`⏳ 执行 docker ${subcommand}...`);

  try {
    let output;
    switch (subcommand) {
      case 'ps':
        output = await executeCommand('docker compose ps');
        break;
      case 'logs':
        const service = args[1] || 'n8n';
        output = await executeCommand(`docker compose logs --tail=30 ${service}`);
        break;
      case 'restart':
        const svc = args[1] || 'n8n';
        output = await executeCommand(`docker compose restart ${svc}`);
        break;
      default:
        return ctx.reply('❌ 可用: ps, logs [service], restart [service]');
    }

    await ctx.reply(`🐳 *docker ${subcommand}*\n\`\`\`\n${output}\n\`\`\``, { parse_mode: 'Markdown' });
  } catch (err) {
    await ctx.reply(`❌ 执行失败: ${err.stderr || err.message}`);
  }
}
