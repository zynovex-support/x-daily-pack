/**
 * Telegram Bot 配置
 */
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Bot Token
  token: process.env.TELEGRAM_BOT_TOKEN,

  // 允许的用户 ID 列表
  allowedUsers: (process.env.ALLOWED_USER_IDS || '')
    .split(',')
    .map(id => parseInt(id.trim()))
    .filter(id => !isNaN(id)),

  // 最大输出长度
  maxOutputLength: parseInt(process.env.MAX_OUTPUT_LENGTH) || 4000,

  // 命令超时 (ms)
  commandTimeout: parseInt(process.env.COMMAND_TIMEOUT) || 60000,

  // 项目根目录
  projectRoot: process.env.PROJECT_ROOT || '/home/henry/x'
};
