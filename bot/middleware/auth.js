/**
 * 用户认证中间件
 */
import { config } from '../config.js';

export function authMiddleware(ctx, next) {
  const userId = ctx.from?.id;

  if (!userId || !config.allowedUsers.includes(userId)) {
    console.log(`[Auth] Unauthorized: ${userId}`);
    return ctx.reply('⛔ 未授权访问');
  }

  return next();
}
