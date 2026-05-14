import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { streamSSE } from 'hono/streaming'
import { channelsRouter } from './channels.js'
import { tasksRouter } from './tasks.js'
import { contentRouter } from './content.js'
import { providersRouter } from './providers.js'
import { pipelineRouter } from './pipeline.js'
import { workflowRouter } from './workflow.js'
import { taskBus } from '../events/bus.js'
import type { TaskEvent } from '../events/bus.js'

export function createApp() {
  const app = new Hono()

  app.use('*', logger())
  app.use(
    '/*',
    cors({
      origin: (origin) => {
        const allowed = (process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',').map((s) => s.trim())
        return allowed.includes(origin) || origin.endsWith('.0pm.cc') ? origin : allowed[0]
      },
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    }),
  )

  app.use('/*', async (c, next) => {
    if (c.req.path === '/health') return next()
    // SSE endpoint uses ?token= query param instead of Authorization header
    if (c.req.path === '/tasks/events') return next()
    const secret = process.env.API_SECRET
    if (secret) {
      const auth = c.req.header('Authorization')
      if (!auth || auth !== `Bearer ${secret}`) {
        return c.json({ error: 'Unauthorized' }, 401)
      }
    }
    await next()
  })

  app.get('/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }))

  // SSE endpoint - registered directly before sub-routers to ensure it matches first
  app.get('/tasks/events', async (c) => {
    const token = c.req.query('token')
    const secret = process.env.API_SECRET
    if (secret && token !== secret) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ event: 'ping', data: 'connected' })

      const handler = (event: TaskEvent) => {
        stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event),
        }).catch(() => { /* client disconnected */ })
      }

      taskBus.on('task', handler)

      let alive = true
      stream.onAbort(() => {
        alive = false
        taskBus.off('task', handler)
      })

      while (alive) {
        await stream.sleep(25000)
        if (!alive) break
        await stream.writeSSE({ event: 'ping', data: Date.now().toString() }).catch(() => {
          alive = false
        })
      }

      taskBus.off('task', handler)
    })
  })

  app.route('/channels', channelsRouter)
  app.route('/tasks', tasksRouter)
  app.route('/content', contentRouter)
  app.route('/providers', providersRouter)
  app.route('/pipeline', pipelineRouter)
  app.route('/workflow', workflowRouter)

  // Debug: log all registered routes
  console.log('[Routes] Registered routes:')
  app.routes.forEach((route) => {
    console.log(`  ${route.method} ${route.path}`)
  })

  return app
}
