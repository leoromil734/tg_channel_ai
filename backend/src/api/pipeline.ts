import { Hono } from 'hono'
import { db } from '../db/index.js'
import { channels, tasks } from '../db/schema.js'
import { eq } from 'drizzle-orm'

export const pipelineRouter = new Hono()

let botInstance: import('grammy').Bot | undefined

export function setBotInstance(bot: import('grammy').Bot) {
  botInstance = bot
}

export function getBotInstance() {
  return botInstance
}

/**
 * POST /pipeline/run/:channelId
 *
 * Starts the pipeline asynchronously and returns immediately with a taskId.
 * The caller should poll GET /tasks/:id to track progress and get the result.
 */
pipelineRouter.post('/run/:channelId', async (c) => {
  const channelId = parseInt(c.req.param('channelId'), 10)
  const body = (await c.req.json().catch(() => ({}))) as { preview?: boolean }
  const isPreview = body.preview === true

  const channelRows = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1)
  if (!channelRows[0]) return c.json({ error: 'Channel not found' }, 404)

  const triggerType = isPreview ? 'preview' : 'manual'

  // Create the task row upfront so we can return the ID immediately
  const [task] = await db
    .insert(tasks)
    .values({ channelId, triggerType, status: 'pending', currentStep: '' })
    .returning()

  // Fire-and-forget: run pipeline in background
  const { runPipelineWithTask } = await import('../orchestrator/pipeline.js')
  runPipelineWithTask(task.id, channelId, triggerType, isPreview ? undefined : botInstance).catch((err) => {
    console.error(`[Pipeline] Background task ${task.id} failed:`, err.message)
  })

  return c.json({ success: true, taskId: task.id })
})
