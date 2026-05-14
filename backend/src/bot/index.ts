import { Bot } from 'grammy'
import { registerAddChannel } from './commands/addchannel.js'
import { registerChannels } from './commands/channels.js'
import { registerRun } from './commands/run.js'
import { registerStatus } from './commands/status.js'
import { registerSetSchedule } from './commands/setschedule.js'
import { registerAutoDiscover } from './handlers/autoDiscover.js'

export function createBot(token: string): Bot {
  const bot = new Bot(token)

  bot.command('start', async (ctx) => {
    await ctx.reply(
      `👋 欢迎使用 <b>Channel AI</b> 频道运营助手！\n\n` +
      `<b>可用命令：</b>\n` +
      `/addchannel - 添加管理频道\n` +
      `/channels - 查看所有频道\n` +
      `/run <id> - 手动触发内容生成\n` +
      `/preview <id> - 预览内容（不发布）\n` +
      `/setschedule <id> <cron> - 设置定时发布\n` +
      `/togglechannel <id> - 启用/禁用频道\n` +
      `/status - 查看今日任务状态`,
      { parse_mode: 'HTML' },
    )
  })

  bot.command('help', async (ctx) => {
    await ctx.reply(
      `<b>Channel AI 指令帮助</b>\n\n` +
      `<code>/addchannel @channelname</code>\n添加一个新频道并设置基本信息\n\n` +
      `<code>/channels</code>\n列出所有管理的频道及状态\n\n` +
      `<code>/run &lt;channel_id&gt;</code>\n手动触发指定频道的内容生成和发布\n\n` +
      `<code>/preview &lt;channel_id&gt;</code>\n预览生成的内容，不实际发布\n\n` +
      `<code>/setschedule &lt;id&gt; &lt;cron&gt;</code>\n设置自动发布时间，如：0 9 * * *\n\n` +
      `<code>/togglechannel &lt;id&gt;</code>\n切换频道启用/禁用状态\n\n` +
      `<code>/status</code>\n查看今日所有任务的执行状态`,
      { parse_mode: 'HTML' },
    )
  })

  registerAutoDiscover(bot)
  registerAddChannel(bot)
  registerChannels(bot)
  registerRun(bot)
  registerStatus(bot)
  registerSetSchedule(bot)

  bot.catch((err) => {
    console.error('Bot error:', err)
  })

  return bot
}
