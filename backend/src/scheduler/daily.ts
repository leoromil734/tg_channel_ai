import cron from 'node-cron'
import { db } from '../db/index.js'
import { channels } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { runPipeline } from '../orchestrator/pipeline.js'
import type { Bot } from 'grammy'

const scheduledJobs = new Map<number, cron.ScheduledTask>()

export function startScheduler(bot: Bot) {
  console.log('[Scheduler] Starting...')
  refreshSchedules(bot)

  // Refresh recurring schedules every 5 minutes
  cron.schedule('*/5 * * * *', () => refreshSchedules(bot))

  // Check one-time schedules every minute
  cron.schedule('* * * * *', () => checkOnceSchedules(bot))

  console.log('[Scheduler] Running.')
}

async function checkOnceSchedules(bot: Bot) {
  const now = new Date()
  const allChannels = await db.select().from(channels)

  for (const channel of allChannels) {
    if (!channel.isActive || !channel.scheduleOnce) continue

    const scheduledAt = new Date(channel.scheduleOnce)
    if (isNaN(scheduledAt.getTime())) continue

    // Fire if the scheduled time is in the past or within the current minute
    if (scheduledAt <= now) {
      console.log(`[Scheduler] One-time trigger for channel: ${channel.name} (scheduled: ${channel.scheduleOnce})`)

      // Clear the schedule_once field immediately to prevent re-triggering
      await db.update(channels)
        .set({ scheduleOnce: '', updatedAt: new Date().toISOString() })
        .where(eq(channels.id, channel.id))

      try {
        await runPipeline(channel.id, 'auto', bot)
        console.log(`[Scheduler] One-time run completed for: ${channel.name}`)
      } catch (err) {
        console.error(`[Scheduler] One-time run failed for ${channel.name}:`, (err as Error).message)
      }
    }
  }
}

async function refreshSchedules(bot: Bot) {
  const activeChannels = await db
    .select()
    .from(channels)
    .then((rows) => rows.filter((ch) => ch.isActive && ch.scheduleCron))

  const currentIds = new Set(activeChannels.map((ch) => ch.id))

  for (const [id, job] of scheduledJobs) {
    if (!currentIds.has(id)) {
      job.stop()
      scheduledJobs.delete(id)
      console.log(`[Scheduler] Removed schedule for channel ${id}`)
    }
  }

  for (const channel of activeChannels) {
    const cronExpr = channel.scheduleCron!
    if (!cron.validate(cronExpr)) {
      console.warn(`[Scheduler] Invalid cron for channel ${channel.id}: "${cronExpr}"`)
      continue
    }

    const existing = scheduledJobs.get(channel.id)
    if (existing) {
      existing.stop()
      scheduledJobs.delete(channel.id)
    }

    const job = cron.schedule(cronExpr, async () => {
      console.log(`[Scheduler] Auto-run: ${channel.name} (${channel.id})`)
      try {
        await runPipeline(channel.id, 'auto', bot)
      } catch (err) {
        console.error(`[Scheduler] Auto-run failed for ${channel.name}:`, (err as Error).message)
      }
    })

    scheduledJobs.set(channel.id, job)
    console.log(`[Scheduler] Scheduled "${channel.name}" → ${cronExpr}`)
  }
}

export function getScheduledCount() {
  return scheduledJobs.size
}
