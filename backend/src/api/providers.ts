import { Hono } from 'hono'
import { db } from '../db/index.js'
import { aiProviders } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { clearProviderCache } from '../providers/index.js'

const providerSchema = z.object({
  label: z.string().min(1),
  providerType: z.enum(['openai', 'anthropic', 'gemini', 'deepseek', 'openai_compatible']),
  apiKey: z.string().min(1),
  baseUrl: z.string().default(''),
  defaultModel: z.string().default(''),
  isEnabled: z.boolean().default(true),
})

const providerUpdateSchema = providerSchema.partial().omit({ apiKey: true }).extend({
  apiKey: z.string().optional(),
})

const SAFE_FIELDS = {
  id: aiProviders.id,
  label: aiProviders.label,
  providerType: aiProviders.providerType,
  baseUrl: aiProviders.baseUrl,
  defaultModel: aiProviders.defaultModel,
  isEnabled: aiProviders.isEnabled,
  createdAt: aiProviders.createdAt,
  updatedAt: aiProviders.updatedAt,
  // apiKey intentionally omitted
} as const

export const providersRouter = new Hono()

providersRouter.get('/', async (c) => {
  const rows = await db.select(SAFE_FIELDS).from(aiProviders).orderBy(aiProviders.createdAt)
  return c.json(rows)
})

providersRouter.post('/', async (c) => {
  const body = await c.req.json()
  const parsed = providerSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const [created] = await db.insert(aiProviders).values(parsed.data).returning(SAFE_FIELDS)
  clearProviderCache()
  return c.json(created, 201)
})

providersRouter.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  const body = await c.req.json()
  const parsed = providerUpdateSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const updateData: Record<string, unknown> = { ...parsed.data, updatedAt: new Date().toISOString() }
  if (!parsed.data.apiKey) delete updateData.apiKey

  const [updated] = await db.update(aiProviders).set(updateData).where(eq(aiProviders.id, id)).returning(SAFE_FIELDS)
  if (!updated) return c.json({ error: 'Not found' }, 404)
  clearProviderCache()
  return c.json(updated)
})

providersRouter.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  const [deleted] = await db.delete(aiProviders).where(eq(aiProviders.id, id)).returning()
  if (!deleted) return c.json({ error: 'Not found' }, 404)
  clearProviderCache()
  return c.json({ success: true })
})

/** POST /providers/:id/test — verify the provider is reachable and returns a valid response */
providersRouter.post('/:id/test', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  const rows = await db.select().from(aiProviders).where(eq(aiProviders.id, id)).limit(1)
  if (!rows[0]) return c.json({ error: 'Not found' }, 404)
  const row = rows[0]

  const model = row.defaultModel || 'gpt-4o-mini'
  const start = Date.now()

  try {
    const { getProviderById } = await import('../providers/index.js')
    const provider = await getProviderById(id, model)

    const response = await provider.generateText('Reply with exactly: "OK"', {
      systemPrompt: 'You are a test assistant. Follow the instruction exactly.',
      temperature: 0,
      maxTokens: 512,   // Reasoning models consume tokens on chain-of-thought before content
    })

    const latency = Date.now() - start
    return c.json({
      ok: true,
      latency,
      model,
      providerType: row.providerType,
      label: row.label,
      response: response.trim().slice(0, 100),
    })
  } catch (err) {
    const latency = Date.now() - start
    return c.json({
      ok: false,
      latency,
      model,
      providerType: row.providerType,
      label: row.label,
      error: (err as Error).message,
    }, 200) // Return 200 so frontend can read the body
  }
})
