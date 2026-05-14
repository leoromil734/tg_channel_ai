import type { Bot } from 'grammy'
import { db } from '../../db/index.js'
import { tasks, channels } from '../../db/schema.js'
import { eq, desc, gte } from 'drizzle-orm'
import { adminOnly } from '../middleware/auth.js'

export function registerStatus(bot: Bot) {
  bot.command('status', adminOnly, async (ctx) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString()

    const todayTasks = await db
      .select({
        id: tasks.id,
        status: tasks.status,
        triggerType: tasks.triggerType,
        createdAt: tasks.createdAt,
        channelName: channels.name,
        channelId: tasks.channelId,
      })
      .from(tasks)
      .leftJoin(channels, eq(tasks.channelId, channels.id))
      .where(gte(tasks.createdAt, todayStr))
      .orderBy(desc(tasks.createdAt))
      .limit(20)

    const done = todayTasks.filter((t) => t.status === 'done').length
    const failed = todayTasks.filter((t) => t.status === 'failed').length
    const running = todayTasks.filter((t) => t.status === 'running').length
    const pending = todayTasks.filter((t) => t.status === 'pending').length

    const statusEmoji: Record<string, string> = {
      done: '✅',
      failed: '❌',
      running: '⏳',
      pending: '🕐',
    }

    const taskLines = todayTasks
      .slice(0, 10)
      .map((t) => {
        const time = t.createdAt?.split('T')[1]?.slice(0, 5) ?? ''
        return `${statusEmoji[t.status ?? 'pending']} [${time}] ${t.channelName ?? 'Unknown'} (${t.triggerType})`
      })
      .join('\n')

    await ctx.reply(
      `📊 <b>今日任务状态</b>\n\n` +
      `✅ 成功：${done} | ❌ 失败：${failed} | ⏳ 进行中：${running} | 🕐 等待：${pending}\n\n` +
      `<b>最近任务：</b>\n${taskLines || '今日暂无任务'}`,
      { parse_mode: 'HTML' },
    )
  })
}
