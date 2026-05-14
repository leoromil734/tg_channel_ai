import { Hono } from 'hono'
import { db } from '../db/index.js'
import { channels, pipelineConfigs } from '../db/schema.js'
import { eq, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { getBotInstance } from './pipeline.js'

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

/**
 * POST /channels/sync
 * Manually register a channel where the bot is already an admin.
 * Body: { tgChannelId: "@username" | "-100xxxxxxxx" }
 */
channelsRouter.post('/sync', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { tgChannelId?: string }
  const raw = (body.tgChannelId ?? '').trim()
  if (!raw) return c.json({ error: 'tgChannelId is required' }, 400)

  const tgChannelId = raw.startsWith('@') || raw.startsWith('-') ? raw : `@${raw}`

  const bot = getBotInstance()
  if (!bot) return c.json({ error: 'Bot not initialized' }, 503)

  // Fetch chat info from Telegram
  let chatInfo: Awaited<ReturnType<typeof bot.api.getChat>>
  try {
    chatInfo = await bot.api.getChat(tgChannelId)
  } catch (err) {
    return c.json({ error: `Cannot find channel: ${(err as Error).message}` }, 400)
  }

  // Verify bot is an admin
  const botId = bot.botInfo.id
  try {
    const member = await bot.api.getChatMember(chatInfo.id, botId)
    if (member.status !== 'administrator' && member.status !== 'creator') {
      return c.json({ error: 'Bot is not an admin of this channel. Please promote the bot to admin first.' }, 403)
    }
  } catch (err) {
    return c.json({ error: `Cannot verify bot membership: ${(err as Error).message}` }, 400)
  }

  const numericId = chatInfo.id.toString()
  const title = 'title' in chatInfo ? chatInfo.title : tgChannelId
  const description = 'description' in chatInfo ? (chatInfo.description ?? '') : ''

  // Check if already exists
  const existing = await db.select().from(channels).where(eq(channels.tgChannelId, numericId)).limit(1)
  if (existing.length > 0) {
    return c.json({ already_exists: true, channel: existing[0] })
  }

  // Register as inactive (pending confirmation in UI)
  const [newChannel] = await db.insert(channels).values({
    tgChannelId: numericId,
    name: title,
    description,
    userIntro: '',
    isActive: false,
  }).returning()

  await db.insert(pipelineConfigs).values({ channelId: newChannel.id })

  return c.json({ success: true, channel: newChannel }, 201)
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
