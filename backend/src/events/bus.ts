import { EventEmitter } from 'events'

export interface TaskUpdateEvent {
  type: 'task:update'
  taskId: number
  channelId: number
  status: string
  currentStep: string
  errorMessage?: string
}

export interface TaskLogEvent {
  type: 'task:log'
  taskId: number
  level: 'info' | 'warn' | 'error'
  message: string
  timestamp: string
}

export interface TaskStatsEvent {
  type: 'task:stats'
}

export type TaskEvent = TaskUpdateEvent | TaskLogEvent | TaskStatsEvent

class TaskEventBus extends EventEmitter {
  constructor() {
    super()
    this.setMaxListeners(200)
  }

  emitUpdate(data: Omit<TaskUpdateEvent, 'type'>) {
    this.emit('task', { type: 'task:update', ...data } as TaskUpdateEvent)
  }

  emitLog(taskId: number, level: 'info' | 'warn' | 'error', message: string) {
    this.emit('task', {
      type: 'task:log',
      taskId,
      level,
      message,
      timestamp: new Date().toISOString(),
    } as TaskLogEvent)
  }

  emitStats() {
    this.emit('task', { type: 'task:stats' } as TaskStatsEvent)
  }
}

export const taskBus = new TaskEventBus()
