import type { Bot } from 'grammy'
import { db } from '../../db/index.js'
import { channels } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import { runPipeline } from '../../orchestrator/pipeline.js'
import { adminOnly } from '../middleware/auth.js'

export function registerRun(bot: Bot) {
  bot.command('run', adminOnly, async (ctx) => {
    const args = ctx.match?.trim()
    const channelId = parseInt(args ?? '', 10)

    if (isNaN(channelId)) {
      await ctx.reply('用法：/run <channel_id>\n\n使用 /channels 查看频道 ID')
      return
    }

    const channelRows = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1)
    if (!channelRows[0]) {
      await ctx.reply(`❌ 未找到频道 ID: ${channelId}`)
      return
    }

    const channel = channelRows[0]
    const statusMsg = await ctx.reply(`🚀 开始为 <b>${channel.name}</b> 生成内容...\n⏳ 请稍候，这可能需要 30-60 秒`, {
      parse_mode: 'HTML',
    })

    try {
      const result = await runPipeline(channelId, 'manual', bot)
      const preview = result.textContent.slice(0, 200)
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        `✅ <b>${channel.name}</b> 内容发布成功！\n\n` +
        `📝 内容预览：\n${preview}${result.textContent.length > 200 ? '...' : ''}\n\n` +
        `${result.imageUrl ? '🖼️ 已生成配图\n' : ''}` +
        `${result.searchKeywords ? `🔍 搜索关键词：${result.searchKeywords}\n` : ''}` +
        `📨 TG 消息 ID：${result.tgMessageId ?? 'N/A'}`,
        { parse_mode: 'HTML' },
      )
    } catch (err) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        `❌ 内容生成失败：${(err as Error).message}`,
      )
    }
  })

  bot.command('preview', adminOnly, async (ctx) => {
    const args = ctx.match?.trim()
    const channelId = parseInt(args ?? '', 10)

    if (isNaN(channelId)) {
      await ctx.reply('用法：/preview <channel_id>')
      return
    }

    const channelRows = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1)
    if (!channelRows[0]) {
      await ctx.reply(`❌ 未找到频道 ID: ${channelId}`)
      return
    }

    const channel = channelRows[0]
    const statusMsg = await ctx.reply(`👀 正在为 <b>${channel.name}</b> 生成预览...`, {
      parse_mode: 'HTML',
    })

    try {
      const result = await runPipeline(channelId, 'preview', bot)
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        `📋 <b>内容预览（未发布）</b>\n频道：${channel.name}\n\n${result.textContent}\n\n` +
        `${result.imagePrompt ? `🎨 图片提示词：\n<code>${result.imagePrompt.slice(0, 150)}</code>` : ''}`,
        { parse_mode: 'HTML' },
      )
    } catch (err) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        `❌ 预览生成失败：${(err as Error).message}`,
      )
    }
  })
}
