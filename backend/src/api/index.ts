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
    '/api/*',
    cors({
      origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    }),
  )

  app.use('/api/*', async (c, next) => {
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

  app.route('/api/channels', channelsRouter)
  app.route('/api/tasks', tasksRouter)
  app.route('/api/content', contentRouter)
  app.route('/api/providers', providersRouter)
  app.route('/api/pipeline', pipelineRouter)
  app.route('/api/workflow', workflowRouter)

  return app
}
