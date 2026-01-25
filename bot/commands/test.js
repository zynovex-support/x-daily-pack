/**
 * /test 命令 - 运行测试
 */
import { executeCommand } from '../utils/executor.js';

export async function testCommand(ctx) {
  const args = ctx.message.text.split(' ').slice(1);
  const type = args[0] || 'unit';

  const commands = {
    unit: 'npm run test:unit',
    all: 'npm test'
  };

  if (!commands[type]) {
    return ctx.reply(`❌ 不支持: ${type}\n\n可用: unit, all`);
  }

  await ctx.reply(`⏳ 运行 ${type} 测试...`);

  try {
    const output = await executeCommand(commands[type], { timeout: 120000 });
    await ctx.reply(`✅ *测试完成*\n\`\`\`\n${output}\n\`\`\``, { parse_mode: 'Markdown' });
  } catch (err) {
    await ctx.reply(`❌ 测试失败:\n\`\`\`\n${err.stderr || err.message}\n\`\`\``, { parse_mode: 'Markdown' });
  }
}
