import { Hono } from 'hono'
import { db } from '../db/index.js'
import { channels, pipelineConfigs } from '../db/schema.js'
import { eq, type SQL } from 'drizzle-orm'
import { z } from 'zod'

const channelSchema = z.object({
  tgChannelId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  userIntro: z.string().default(''),
  scheduleCron: z.string().default('0 9 * * *'),
  isActive: z.boolean().default(true),
})

const configSchema = z.object({
  searchEnabled: z.boolean().optional(),
  searchQueryTemplate: z.string().optional(),
  imageEnabled: z.boolean().optional(),
  customInstructions: z.string().optional(),
  contentStyle: z.string().optional(),
  language: z.string().optional(),
})

export const channelsRouter = new Hono()

channelsRouter.get('/', async (c) => {
  const rows = await db.select().from(channels).orderBy(channels.createdAt)
  return c.json(rows)
})

/** GET /channels/pending — auto-discovered channels awaiting web UI confirmation */
channelsRouter.get('/pending', async (c) => {
  const rows = await db
    .select()
    .from(channels)
    .where(eq(channels.isActive, false))
    .orderBy(channels.createdAt)
  return c.json(rows)
})

/** POST /channels/:id/activate — confirm and activate an auto-discovered channel */
channelsRouter.post('/:id/activate', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  const body = await c.req.json().catch(() => ({}))

  const updateData: Record<string, unknown> = {
    isActive: true,
    updatedAt: new Date().toISOString(),
  }
  if (body.name) updateData.name = body.name
  if (body.description !== undefined) updateData.description = body.description
  if (body.userIntro !== undefined) updateData.userIntro = body.userIntro
  if (body.scheduleCron) updateData.scheduleCron = body.scheduleCron

  const [updated] = await db
    .update(channels)
    .set(updateData)
    .where(eq(channels.id, id))
    .returning()

  if (!updated) return c.json({ error: 'Not found' }, 404)

  // Ensure pipeline config exists
  const configs = await db.select().from(pipelineConfigs).where(eq(pipelineConfigs.channelId, id)).limit(1)
  if (configs.length === 0) {
    await db.insert(pipelineConfigs).values({ channelId: id })
  }

  return c.json(updated)
})

channelsRouter.post('/', async (c) => {
  const body = await c.req.json()
  const parsed = channelSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const existing = await db
    .select()
    .from(channels)
    .where(eq(channels.tgChannelId, parsed.data.tgChannelId))
    .limit(1)
  if (existing.length > 0) return c.json({ error: 'Channel already exists' }, 409)

  const [newChannel] = await db.insert(channels).values(parsed.data).returning()
  await db.insert(pipelineConfigs).values({ channelId: newChannel.id })
  return c.json(newChannel, 201)
})

channelsRouter.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  const rows = await db.select().from(channels).where(eq(channels.id, id)).limit(1)
  if (!rows[0]) return c.json({ error: 'Not found' }, 404)

  const configs = await db.select().from(pipelineConfigs).where(eq(pipelineConfigs.channelId, id)).limit(1)
  return c.json({ ...rows[0], config: configs[0] ?? null })
})

channelsRouter.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  const body = await c.req.json()
  const parsed = channelSchema.partial().safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const [updated] = await db
    .update(channels)
    .set({ ...parsed.data, updatedAt: new Date().toISOString() })
    .where(eq(channels.id, id))
    .returning()
  if (!updated) return c.json({ error: 'Not found' }, 404)
  return c.json(updated)
})

channelsRouter.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  const [deleted] = await db.delete(channels).where(eq(channels.id, id)).returning()
  if (!deleted) return c.json({ error: 'Not found' }, 404)
  return c.json({ success: true })
})

channelsRouter.get('/:id/config', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  const rows = await db.select().from(pipelineConfigs).where(eq(pipelineConfigs.channelId, id)).limit(1)
  if (!rows[0]) return c.json({ error: 'Not found' }, 404)
  return c.json(rows[0])
})

channelsRouter.put('/:id/config', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  const body = await c.req.json()
  const parsed = configSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const existing = await db.select().from(pipelineConfigs).where(eq(pipelineConfigs.channelId, id)).limit(1)

  if (existing.length === 0) {
    const [created] = await db
      .insert(pipelineConfigs)
      .values({ channelId: id, ...parsed.data })
      .returning()
    return c.json(created)
  }

  const [updated] = await db
    .update(pipelineConfigs)
    .set({ ...parsed.data, updatedAt: new Date().toISOString() })
    .where(eq(pipelineConfigs.channelId, id))
    .returning()
  return c.json(updated)
})
