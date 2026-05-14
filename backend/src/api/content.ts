import { Hono } from 'hono'
import { db } from '../db/index.js'
import { contentHistory, channels } from '../db/schema.js'
import { eq, desc, and, gte, lte, type SQL } from 'drizzle-orm'

export const contentRouter = new Hono()

contentRouter.get('/', async (c) => {
  const channelId = c.req.query('channelId')
  const dateFrom = c.req.query('dateFrom')
  const dateTo = c.req.query('dateTo')
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100)
  const offset = parseInt(c.req.query('offset') ?? '0', 10)

  const conditions: SQL[] = []
  if (channelId) conditions.push(eq(contentHistory.channelId, parseInt(channelId, 10)))
  if (dateFrom) conditions.push(gte(contentHistory.createdAt, `${dateFrom}T00:00:00`))
  if (dateTo) conditions.push(lte(contentHistory.createdAt, `${dateTo}T23:59:59`))

  const rows = await db
    .select({
      id: contentHistory.id,
      taskId: contentHistory.taskId,
      channelId: contentHistory.channelId,
      channelName: channels.name,
      textContent: contentHistory.textContent,
      imageUrl: contentHistory.imageUrl,
      imagePrompt: contentHistory.imagePrompt,
      searchKeywords: contentHistory.searchKeywords,
      tgMessageId: contentHistory.tgMessageId,
      isPreview: contentHistory.isPreview,
      createdAt: contentHistory.createdAt,
    })
    .from(contentHistory)
    .leftJoin(channels, eq(contentHistory.channelId, channels.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(contentHistory.createdAt))
    .limit(limit)
    .offset(offset)

  return c.json(rows)
})

contentRouter.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  const rows = await db.select().from(contentHistory).where(eq(contentHistory.id, id)).limit(1)
  if (!rows[0]) return c.json({ error: 'Not found' }, 404)
  return c.json(rows[0])
})

contentRouter.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  const [deleted] = await db.delete(contentHistory).where(eq(contentHistory.id, id)).returning()
  if (!deleted) return c.json({ error: 'Not found' }, 404)
  return c.json({ success: true })
})
