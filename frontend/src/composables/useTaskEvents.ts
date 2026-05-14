import { ref, onMounted, onUnmounted } from 'vue'

export type SSETaskEvent =
  | { type: 'task:update'; taskId: number; channelId: number; status: string; currentStep: string; errorMessage?: string }
  | { type: 'task:log'; taskId: number; level: string; message: string; timestamp: string }
  | { type: 'task:stats' }

type Handler = (event: SSETaskEvent) => void

const SSE_URL = '/res/tasks/events'
const RECONNECT_DELAY = 3000

let sharedEs: EventSource | null = null
let refCount = 0
const handlers = new Set<Handler>()
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

function getToken() {
  return (localStorage.getItem('api_secret') ?? '').trim()
}

function broadcast(event: SSETaskEvent) {
  handlers.forEach((h) => h(event))
}

function connect() {
  if (sharedEs) return
  const token = encodeURIComponent(getToken())
  sharedEs = new EventSource(`${SSE_URL}?token=${token}`)

  const handleEvent = (type: string, raw: string) => {
    try {
      const data = JSON.parse(raw) as SSETaskEvent
      broadcast(data)
    } catch {
      broadcast({ type } as unknown as SSETaskEvent)
    }
  }

  sharedEs.addEventListener('task:update', (e) => handleEvent('task:update', (e as MessageEvent).data))
  sharedEs.addEventListener('task:log', (e) => handleEvent('task:log', (e as MessageEvent).data))
  sharedEs.addEventListener('task:stats', () => broadcast({ type: 'task:stats' }))
  sharedEs.addEventListener('ping', () => { /* keepalive */ })

  sharedEs.onerror = () => {
    sharedEs?.close()
    sharedEs = null
    if (handlers.size > 0) {
      reconnectTimer = setTimeout(connect, RECONNECT_DELAY)
    }
  }
}

function disconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  sharedEs?.close()
  sharedEs = null
}

/**
 * Composable that subscribes to SSE task events.
 * A single shared EventSource is used across all instances.
 */
export function useTaskEvents(onEvent?: Handler) {
  const connected = ref(false)

  onMounted(() => {
    refCount++
    if (onEvent) handlers.add(onEvent)
    connect()
    // Reflect connection state
    const check = setInterval(() => {
      connected.value = sharedEs?.readyState === EventSource.OPEN
    }, 1000)
    onUnmounted(() => clearInterval(check))
  })

  onUnmounted(() => {
    if (onEvent) handlers.delete(onEvent)
    refCount--
    if (refCount <= 0) {
      refCount = 0
      disconnect()
    }
  })

  return { connected }
}
