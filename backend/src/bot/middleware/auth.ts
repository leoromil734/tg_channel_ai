import type { Context, NextFunction } from 'grammy'

const ADMIN_IDS = (process.env.ADMIN_USER_IDS ?? '')
  .split(',')
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => !isNaN(n))

export async function adminOnly(ctx: Context, next: NextFunction) {
  const userId = ctx.from?.id
  if (!userId) {
    await ctx.reply('⛔ 无法验证用户身份')
    return
  }
  if (ADMIN_IDS.length > 0 && !ADMIN_IDS.includes(userId)) {
    await ctx.reply('⛔ 您没有权限使用此命令')
    return
  }
  await next()
}
