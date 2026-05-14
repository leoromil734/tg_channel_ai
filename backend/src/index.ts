import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './api/index.js'
import { createBot } from './bot/index.js'
import { startScheduler } from './scheduler/daily.js'
import { setBotInstance } from './api/pipeline.js'

const BOT_TOKEN = process.env.BOT_TOKEN
if (!BOT_TOKEN) {
  console.error('ERROR: BOT_TOKEN environment variable is required')
  process.exit(1)
}

async function main() {
  // Run DB migration
  const { execSync } = await import('child_process')
  try {
    execSync('npx tsx src/db/migrate.ts', { stdio: 'inherit' })
  } catch (err) {
    console.warn('Migration warning:', (err as Error).message)
  }

  // Create Telegram bot
  const bot = createBot(BOT_TOKEN!)
  setBotInstance(bot)

  // Start HTTP API server
  const app = createApp()
  const port = parseInt(process.env.PORT ?? '9005', 10)

  const server = serve({ fetch: app.fetch, port }, () => {
    console.log(`[API] Server running on http://localhost:${port}`)
  })

  // Start scheduler
  startScheduler(bot)

  // Start bot (long polling)
  bot.start({
    onStart: (info) => {
      console.log(`[Bot] Started as @${info.username}`)
    },
  })

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...')
    await bot.stop()
    server.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
