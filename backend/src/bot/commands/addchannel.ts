import type { Bot, Context } from 'grammy'
import { db } from '../../db/index.js'
import { channels, pipelineConfigs } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import { adminOnly } from '../middleware/auth.js'

interface ConversationState {
  channelId: string
  step: 'name' | 'description' | 'intro' | 'done'
  name?: string
  description?: string
}

const conversations = new Map<number, ConversationState>()

export function registerAddChannel(bot: Bot) {
  bot.command('addchannel', adminOnly, async (ctx) => {
    const args = ctx.match?.trim()
    if (!args) {
      await ctx.reply(
        '📢 请提供频道 ID\n用法：<code>/addchannel @channelname</code> 或 <code>/addchannel -1001234567890</code>',
        { parse_mode: 'HTML' },
      )
      return
    }

    const tgChannelId = args.startsWith('@') || args.startsWith('-') ? args : `@${args}`

    const existing = await db.select().from(channels).where(eq(channels.tgChannelId, tgChannelId)).limit(1)
    if (existing.length > 0) {
      await ctx.reply(`⚠️ 频道 <code>${tgChannelId}</code> 已存在`, { parse_mode: 'HTML' })
      return
    }

    const userId = ctx.from!.id
    conversations.set(userId, { channelId: tgChannelId, step: 'name' })

    await ctx.reply(
      `✅ 已接收频道 ID：<code>${tgChannelId}</code>\n\n📝 请输入频道名称（例如：科技日报）：`,
      { parse_mode: 'HTML' },
    )
  })

  bot.on('message:text', async (ctx, next) => {
    const userId = ctx.from?.id
    if (!userId) return next()

    const state = conversations.get(userId)
    if (!state) return next()

    const text = ctx.message.text

    if (state.step === 'name') {
      state.name = text
      state.step = 'description'
      conversations.set(userId, state)
      await ctx.reply('📖 请输入频道简介（频道内容方向描述）：')
    } else if (state.step === 'description') {
      state.description = text
      state.step = 'intro'
      conversations.set(userId, state)
      await ctx.reply(
        '💬 请输入运营说明（AI 创作参考，例如：内容要活泼有趣，多用emoji，每篇结尾加互动问题）\n\n发送 <code>/skip</code> 跳过此步骤：',
        { parse_mode: 'HTML' },
      )
    } else if (state.step === 'intro') {
      const userIntro = text === '/skip' ? '' : text
      await saveChannel(ctx, state, userIntro)
      conversations.delete(userId)
    }
  })
}

async function saveChannel(ctx: Context, state: ConversationState, userIntro: string) {
  const [newChannel] = await db
    .insert(channels)
    .values({
      tgChannelId: state.channelId,
      name: state.name!,
      description: state.description ?? '',
      userIntro,
    })
    .returning()

  await db.insert(pipelineConfigs).values({ channelId: newChannel.id })

  await ctx.reply(
    `🎉 频道添加成功！\n\n` +
    `📢 频道：<code>${state.channelId}</code>\n` +
    `📌 名称：${state.name}\n` +
    `📖 简介：${state.description}\n` +
    `🆔 内部 ID：<code>${newChannel.id}</code>\n\n` +
    `使用 /setschedule ${newChannel.id} <cron> 设置自动发布时间\n` +
    `使用 /run ${newChannel.id} 手动触发内容生成`,
    { parse_mode: 'HTML' },
  )
}
