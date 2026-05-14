import { Hono } from 'hono'
import { db } from '../db/index.js'
import { channels } from '../db/schema.js'
import { eq } from 'drizzle-orm'

export const pipelineRouter = new Hono()

// Lazy import to avoid circular dependency, bot is injected at runtime
let botInstance: import('grammy').Bot | undefined

export function setBotInstance(bot: import('grammy').Bot) {
  botInstance = bot
}

export function getBotInstance() {
  return botInstance
}

pipelineRouter.post('/run/:channelId', async (c) => {
  const channelId = parseInt(c.req.param('channelId'), 10)
  const body = (await c.req.json().catch(() => ({}))) as { preview?: boolean }
  const isPreview = body.preview === true

  const channelRows = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1)
  if (!channelRows[0]) return c.json({ error: 'Channel not found' }, 404)

  const { runPipeline } = await import('../orchestrator/pipeline.js')
  const triggerType = isPreview ? 'preview' : 'manual'

  try {
    const result = await runPipeline(channelId, triggerType, isPreview ? undefined : botInstance)
    return c.json({ success: true, result })
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 500)
  }
})
