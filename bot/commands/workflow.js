/**
 * /workflow 命令 - 触发工作流
 */
import { config } from '../config.js';

export async function workflowCommand(ctx) {
  const text = ctx.message.text || '';

  // 检查是否包含 trigger
  if (text.includes('trigger')) {
    await ctx.reply('⏳ 触发工作流...');

    try {
      const webhookUrl = `http://localhost:5678/webhook/x-daily-pack-trigger`;
      const secret = process.env.WEBHOOK_SECRET;

      const response = await fetch(webhookUrl, {
        method: 'GET',
        headers: {
          'X-Webhook-Secret': secret
        }
      });

      if (response.ok) {
        await ctx.reply('✅ 工作流已触发');
      } else {
        await ctx.reply(`❌ 触发失败: ${response.status}`);
      }
    } catch (err) {
      await ctx.reply(`❌ 触发失败: ${err.message}`);
    }
  } else {
    await ctx.reply('📋 可用命令:\n/workflow trigger - 触发工作流');
  }
}
