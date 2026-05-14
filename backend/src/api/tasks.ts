import { Hono } from 'hono'
import { db } from '../db/index.js'
import { tasks, taskLogs, channels } from '../db/schema.js'
import { eq, desc, gte, and, type SQL } from 'drizzle-orm'

export const tasksRouter = new Hono()

tasksRouter.get('/', async (c) => {
  const channelId = c.req.query('channelId')
  const status = c.req.query('status')
  const date = c.req.query('date')
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 200)
  const offset = parseInt(c.req.query('offset') ?? '0', 10)

  const conditions: SQL[] = []
  if (channelId) conditions.push(eq(tasks.channelId, parseInt(channelId, 10)))
  if (status) conditions.push(eq(tasks.status, status as 'pending' | 'running' | 'done' | 'failed'))
  if (date) conditions.push(gte(tasks.createdAt, `${date}T00:00:00`))

  const rows = await db
    .select({
      id: tasks.id,
      channelId: tasks.channelId,
      channelName: channels.name,
      status: tasks.status,
      triggerType: tasks.triggerType,
      errorMessage: tasks.errorMessage,
      createdAt: tasks.createdAt,
      completedAt: tasks.completedAt,
    })
    .from(tasks)
    .leftJoin(channels, eq(tasks.channelId, channels.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(tasks.createdAt))
    .limit(limit)
    .offset(offset)

  return c.json(rows)
})

tasksRouter.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  const rows = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1)
  if (!rows[0]) return c.json({ error: 'Not found' }, 404)
  return c.json(rows[0])
})

tasksRouter.get('/:id/logs', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  const logs = await db
    .select()
    .from(taskLogs)
    .where(eq(taskLogs.taskId, id))
    .orderBy(taskLogs.createdAt)
  return c.json(logs)
})

tasksRouter.get('/stats/today', async (c) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const todayTasks = await db
    .select()
    .from(tasks)
    .where(gte(tasks.createdAt, today.toISOString()))

  const stats = {
    total: todayTasks.length,
    done: todayTasks.filter((t) => t.status === 'done').length,
    failed: todayTasks.filter((t) => t.status === 'failed').length,
    running: todayTasks.filter((t) => t.status === 'running').length,
    pending: todayTasks.filter((t) => t.status === 'pending').length,
  }

  return c.json(stats)
})
