import type { Bot } from 'grammy'
import { db } from '../../db/index.js'
import { channels } from '../../db/schema.js'
import { adminOnly } from '../middleware/auth.js'

export function registerChannels(bot: Bot) {
  bot.command('channels', adminOnly, async (ctx) => {
    const allChannels = await db.select().from(channels).orderBy(channels.createdAt)

    if (allChannels.length === 0) {
      await ctx.reply('📭 暂无管理的频道\n\n使用 /addchannel @channelname 添加频道')
      return
    }

    const lines = allChannels.map((ch) => {
      const status = ch.isActive ? '🟢' : '🔴'
      return (
        `${status} <b>${ch.name}</b> (ID: <code>${ch.id}</code>)\n` +
        `   📢 ${ch.tgChannelId}\n` +
        `   🕐 ${ch.scheduleCron ?? '未设置'}\n` +
        `   📖 ${(ch.description ?? '').slice(0, 50)}${(ch.description ?? '').length > 50 ? '...' : ''}`
      )
    })

    await ctx.reply(
      `📋 <b>管理的频道列表</b> (共 ${allChannels.length} 个)\n\n` + lines.join('\n\n'),
      { parse_mode: 'HTML' },
    )
  })
}
