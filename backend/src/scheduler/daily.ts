import cron from 'node-cron'
import { db } from '../db/index.js'
import { channels } from '../db/schema.js'
import { runPipeline } from '../orchestrator/pipeline.js'
import type { Bot } from 'grammy'

const scheduledJobs = new Map<number, cron.ScheduledTask>()

export function startScheduler(bot: Bot) {
  console.log('[Scheduler] Starting...')
  refreshSchedules(bot)

  // Refresh schedules every 5 minutes to pick up configuration changes
  cron.schedule('*/5 * * * *', () => {
    refreshSchedules(bot)
  })

  console.log('[Scheduler] Running.')
}

async function refreshSchedules(bot: Bot) {
  const activeChannels = await db
    .select()
    .from(channels)
    .then((rows) => rows.filter((ch) => ch.isActive && ch.scheduleCron))

  const currentIds = new Set(activeChannels.map((ch) => ch.id))

  // Remove schedules for channels that are no longer active
  for (const [id, job] of scheduledJobs) {
    if (!currentIds.has(id)) {
      job.stop()
      scheduledJobs.delete(id)
      console.log(`[Scheduler] Removed schedule for channel ${id}`)
    }
  }

  // Add or update schedules
  for (const channel of activeChannels) {
    const cronExpr = channel.scheduleCron!

    if (!cron.validate(cronExpr)) {
      console.warn(`[Scheduler] Invalid cron expression for channel ${channel.id}: "${cronExpr}"`)
      continue
    }

    const existing = scheduledJobs.get(channel.id)
    if (existing) {
      existing.stop()
      scheduledJobs.delete(channel.id)
    }

    const job = cron.schedule(cronExpr, async () => {
      console.log(`[Scheduler] Triggering auto-run for channel: ${channel.name} (${channel.id})`)
      try {
        await runPipeline(channel.id, 'auto', bot)
        console.log(`[Scheduler] Auto-run completed for channel: ${channel.name}`)
      } catch (err) {
        console.error(`[Scheduler] Auto-run failed for channel ${channel.name}:`, (err as Error).message)
      }
    })

    scheduledJobs.set(channel.id, job)
    console.log(`[Scheduler] Scheduled channel "${channel.name}" with cron: "${cronExpr}"`)
  }
}

export function getScheduledCount() {
  return scheduledJobs.size
}
