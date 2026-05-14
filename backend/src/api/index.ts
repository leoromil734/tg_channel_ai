import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { channelsRouter } from './channels.js'
import { tasksRouter } from './tasks.js'
import { contentRouter } from './content.js'
import { providersRouter } from './providers.js'
import { pipelineRouter } from './pipeline.js'
import { workflowRouter } from './workflow.js'

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

  app.route('/channels', channelsRouter)
  app.route('/tasks', tasksRouter)
  app.route('/content', contentRouter)
  app.route('/providers', providersRouter)
  app.route('/pipeline', pipelineRouter)
  app.route('/workflow', workflowRouter)

  return app
}
