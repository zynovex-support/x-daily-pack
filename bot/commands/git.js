/**
 * /git 命令 - Git 操作
 */
import { executeCommand } from '../utils/executor.js';

const ALLOWED_SUBCOMMANDS = ['status', 'pull', 'log'];

export async function gitCommand(ctx) {
  const args = ctx.message.text.split(' ').slice(1);
  const subcommand = args[0] || 'status';

  if (!ALLOWED_SUBCOMMANDS.includes(subcommand)) {
    return ctx.reply(`❌ 不支持的子命令: ${subcommand}\n\n可用: ${ALLOWED_SUBCOMMANDS.join(', ')}`);
  }

  await ctx.reply(`⏳ 执行 git ${subcommand}...`);

  try {
    let output;
    switch (subcommand) {
      case 'status':
        output = await executeCommand('git status -sb');
        break;
      case 'pull':
        output = await executeCommand('git pull --rebase');
        break;
      case 'log':
        output = await executeCommand('git log --oneline -10');
        break;
    }

    await ctx.reply(`📦 *git ${subcommand}*\n\`\`\`\n${output}\n\`\`\``, { parse_mode: 'Markdown' });
  } catch (err) {
    await ctx.reply(`❌ 执行失败: ${err.stderr || err.message}`);
  }
}
