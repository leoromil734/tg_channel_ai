import type { Bot } from 'grammy'
import { db } from '../../db/index.js'
import { channels, pipelineConfigs } from '../../db/schema.js'
import { eq } from 'drizzle-orm'

/**
 * Auto-discover channels when the bot is added as admin.
 *
 * Listens for `my_chat_member` updates — fired whenever the bot's own
 * membership status changes in any chat. When promoted to admin/creator
 * in a *channel*, the channel is automatically registered in the DB
 * (isActive = false, pending confirmation from the web UI).
 */
export function registerAutoDiscover(bot: Bot) {
  bot.on('my_chat_member', async (ctx) => {
    const update = ctx.myChatMember
    const chat = update.chat
    const newStatus = update.new_chat_member.status

    // Only handle supergroups and channels
    if (chat.type !== 'channel' && chat.type !== 'supergroup') return

    // Only react when bot gains admin/creator rights
    const isAdmin = newStatus === 'administrator' || newStatus === 'creator'
    const wasAdmin =
      update.old_chat_member.status === 'administrator' ||
      update.old_chat_member.status === 'creator'

    if (!isAdmin) return // bot was removed or restricted — ignore

    const tgChannelId = chat.id.toString()
    const channelTitle = chat.title ?? tgChannelId

    // Check if already registered
    const existing = await db
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.tgChannelId, tgChannelId))
      .limit(1)

    if (existing.length > 0) {
      if (!wasAdmin) {
        // Possibly re-promoted — just ensure active state is preserved
        console.log(`[AutoDiscover] Bot re-promoted in known channel: ${channelTitle} (${tgChannelId})`)
      }
      return
    }

    // Fetch additional channel info from Telegram
    let description = ''
    try {
      const chatInfo = await ctx.api.getChat(chat.id)
      if ('description' in chatInfo) {
        description = chatInfo.description ?? ''
      }
    } catch {
      // Not critical — proceed without description
    }

    // Auto-register as inactive (pending web UI confirmation)
    const [newChannel] = await db
      .insert(channels)
      .values({
        tgChannelId,
        name: channelTitle,
        description,
        userIntro: '',
        isActive: false, // Requires confirmation in web UI
      })
      .returning()

    await db.insert(pipelineConfigs).values({ channelId: newChannel.id })

    console.log(`[AutoDiscover] New channel registered: "${channelTitle}" (${tgChannelId}), id=${newChannel.id}`)

    // Notify the admin who added the bot (if from a private chat context)
    // In channel admin promotions there's no direct "from" — skip notification
  })
}
