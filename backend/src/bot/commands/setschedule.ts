import type { Bot } from 'grammy'
import { db } from '../../db/index.js'
import { channels } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import { adminOnly } from '../middleware/auth.js'

const CRON_PRESETS: Record<string, string> = {
  '每天早上9点': '0 9 * * *',
  '每天中午12点': '0 12 * * *',
  '每天下午6点': '0 18 * * *',
  '每天晚上8点': '0 20 * * *',
  '每6小时': '0 */6 * * *',
}

export function registerSetSchedule(bot: Bot) {
  bot.command('setschedule', adminOnly, async (ctx) => {
    const args = (ctx.match ?? '').trim().split(/\s+/)
    const channelId = parseInt(args[0] ?? '', 10)
    const cron = args.slice(1).join(' ')

    if (isNaN(channelId) || !cron) {
      const presets = Object.entries(CRON_PRESETS)
        .map(([label, expr]) => `  ${label}：<code>${expr}</code>`)
        .join('\n')

      await ctx.reply(
        `用法：/setschedule <channel_id> <cron表达式>\n\n` +
        `<b>常用预设：</b>\n${presets}\n\n` +
        `例如：<code>/setschedule 1 0 9 * * *</code>（每天早上9点）`,
        { parse_mode: 'HTML' },
      )
      return
    }

    const channelRows = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1)
    if (!channelRows[0]) {
      await ctx.reply(`❌ 未找到频道 ID: ${channelId}`)
      return
    }

    await db
      .update(channels)
      .set({ scheduleCron: cron, updatedAt: new Date().toISOString() })
      .where(eq(channels.id, channelId))

    await ctx.reply(
      `✅ 频道 <b>${channelRows[0].name}</b> 的定时计划已更新\n\n🕐 Cron: <code>${cron}</code>`,
      { parse_mode: 'HTML' },
    )
  })

  bot.command('togglechannel', adminOnly, async (ctx) => {
    const channelId = parseInt((ctx.match ?? '').trim(), 10)
    if (isNaN(channelId)) {
      await ctx.reply('用法：/togglechannel <channel_id>')
      return
    }

    const rows = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1)
    if (!rows[0]) {
      await ctx.reply(`❌ 未找到频道 ID: ${channelId}`)
      return
    }

    const newActive = !rows[0].isActive
    await db
      .update(channels)
      .set({ isActive: newActive, updatedAt: new Date().toISOString() })
      .where(eq(channels.id, channelId))

    await ctx.reply(
      `${newActive ? '🟢 已启用' : '🔴 已禁用'} 频道 <b>${rows[0].name}</b>`,
      { parse_mode: 'HTML' },
    )
  })
}
