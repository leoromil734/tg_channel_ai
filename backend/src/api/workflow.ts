import { Hono } from 'hono'
import { db } from '../db/index.js'
import { workflowNodes, channels } from '../db/schema.js'
import { eq, asc } from 'drizzle-orm'
import { z } from 'zod'
import { clearProviderCache } from '../providers/index.js'

const nodeSchema = z.object({
  stepType: z.enum(['brain', 'researcher', 'writer', 'prompter', 'illustrator', 'reviewer']),
  stepOrder: z.number().int().default(0),
  providerId: z.number().int().nullable().optional(),
  model: z.string().default(''),
  systemPrompt: z.string().default(''),
  temperature: z.number().min(0).max(2).default(0.8),
  maxTokens: z.number().int().min(1).max(32000).default(2048),
  isEnabled: z.boolean().default(true),
})

export const workflowRouter = new Hono()

/** GET /api/workflow/:channelId – list all nodes for a channel */
workflowRouter.get('/:channelId', async (c) => {
  const channelId = parseInt(c.req.param('channelId'), 10)
  const nodes = await db
    .select()
    .from(workflowNodes)
    .where(eq(workflowNodes.channelId, channelId))
    .orderBy(asc(workflowNodes.stepOrder))
  return c.json(nodes)
})

/** POST /api/workflow/:channelId – upsert (replace all nodes for channel) */
workflowRouter.post('/:channelId', async (c) => {
  const channelId = parseInt(c.req.param('channelId'), 10)

  const channelRows = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1)
  if (!channelRows[0]) return c.json({ error: 'Channel not found' }, 404)

  const body = await c.req.json() as unknown[]
  if (!Array.isArray(body)) return c.json({ error: 'Expected array of nodes' }, 400)

  const parsed = body.map((item, i) => {
    const result = nodeSchema.safeParse(item)
    if (!result.success) throw new Error(`Node[${i}]: ${JSON.stringify(result.error.flatten())}`)
    return { ...result.data, channelId }
  })

  // Replace all nodes for this channel
  await db.delete(workflowNodes).where(eq(workflowNodes.channelId, channelId))
  const created = parsed.length > 0
    ? await db.insert(workflowNodes).values(parsed).returning()
    : []

  clearProviderCache()
  return c.json(created)
})

/** PUT /api/workflow/node/:id – update single node */
workflowRouter.put('/node/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  const body = await c.req.json()
  const parsed = nodeSchema.partial().safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const [updated] = await db
    .update(workflowNodes)
    .set({ ...parsed.data, updatedAt: new Date().toISOString() })
    .where(eq(workflowNodes.id, id))
    .returning()

  if (!updated) return c.json({ error: 'Not found' }, 404)
  clearProviderCache()
  return c.json(updated)
})

/** DELETE /api/workflow/node/:id */
workflowRouter.delete('/node/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  const [deleted] = await db.delete(workflowNodes).where(eq(workflowNodes.id, id)).returning()
  if (!deleted) return c.json({ error: 'Not found' }, 404)
  clearProviderCache()
  return c.json({ success: true })
})
