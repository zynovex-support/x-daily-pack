/**
 * /status 命令 - 系统状态
 */
import { executeCommand } from '../utils/executor.js';

export async function statusCommand(ctx) {
  await ctx.reply('⏳ 正在获取系统状态...');

  try {
    // 并行获取各项状态
    const [cpu, mem, disk, docker, git] = await Promise.all([
      executeCommand("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'").catch(() => 'N/A'),
      executeCommand("free -h | awk '/Mem:/ {print $3\"/\"$2}'").catch(() => 'N/A'),
      executeCommand("df -h / | awk 'NR==2 {print $3\"/\"$2}'").catch(() => 'N/A'),
      executeCommand("docker compose ps --format 'table {{.Name}}\t{{.Status}}' 2>/dev/null || echo 'Docker not running'").catch(() => 'N/A'),
      executeCommand("git log -1 --format='%h (%ar)'").catch(() => 'N/A')
    ]);

    const gitBranch = await executeCommand("git branch --show-current").catch(() => 'N/A');
    const gitStatus = await executeCommand("git status --porcelain | wc -l").catch(() => '0');
    const statusText = gitStatus.trim() === '0' ? 'clean' : `${gitStatus.trim()} changes`;

    const message = `📊 *系统状态*

🖥️ *系统*
• CPU: ${cpu}%
• 内存: ${mem}
• 磁盘: ${disk}

🐳 *Docker*
\`\`\`
${docker}
\`\`\`

📦 *Git*
• 分支: ${gitBranch}
• 状态: ${statusText}
• 最新: ${git}

⏰ ${new Date().toLocaleString('zh-CN')}`;

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (err) {
    await ctx.reply(`❌ 获取状态失败: ${err.message || err}`);
  }
}
