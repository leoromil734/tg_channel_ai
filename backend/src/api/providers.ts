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
  isEnabled: z.boolean().default(true),
})

const providerUpdateSchema = providerSchema.partial().omit({ apiKey: true }).extend({
  apiKey: z.string().optional(),
})

export const providersRouter = new Hono()

providersRouter.get('/', async (c) => {
  const rows = await db.select({
    id: aiProviders.id,
    label: aiProviders.label,
    providerType: aiProviders.providerType,
    baseUrl: aiProviders.baseUrl,
    isEnabled: aiProviders.isEnabled,
    createdAt: aiProviders.createdAt,
    updatedAt: aiProviders.updatedAt,
    // apiKey intentionally omitted
  }).from(aiProviders).orderBy(aiProviders.createdAt)
  return c.json(rows)
})

providersRouter.post('/', async (c) => {
  const body = await c.req.json()
  const parsed = providerSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const [created] = await db.insert(aiProviders).values(parsed.data).returning({
    id: aiProviders.id,
    label: aiProviders.label,
    providerType: aiProviders.providerType,
    baseUrl: aiProviders.baseUrl,
    isEnabled: aiProviders.isEnabled,
    createdAt: aiProviders.createdAt,
  })
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

  const [updated] = await db.update(aiProviders).set(updateData).where(eq(aiProviders.id, id)).returning({
    id: aiProviders.id,
    label: aiProviders.label,
    providerType: aiProviders.providerType,
    baseUrl: aiProviders.baseUrl,
    isEnabled: aiProviders.isEnabled,
  })
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
