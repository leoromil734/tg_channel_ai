<template>
  <div class="space-y-5">
    <!-- Filters -->
    <div class="card p-4 flex flex-wrap gap-3 items-center">
      <div>
        <label class="label mb-0 mr-2 inline">频道：</label>
        <select v-model="filterChannelId" class="input w-44" @change="loadTasks">
          <option value="">全部频道</option>
          <option v-for="ch in channels" :key="ch.id" :value="ch.id">{{ ch.name }}</option>
        </select>
      </div>
      <div>
        <label class="label mb-0 mr-2 inline">状态：</label>
        <select v-model="filterStatus" class="input w-32" @change="loadTasks">
          <option value="">全部</option>
          <option value="done">成功</option>
          <option value="failed">失败</option>
          <option value="running">运行中</option>
          <option value="pending">等待</option>
        </select>
      </div>
      <div>
        <label class="label mb-0 mr-2 inline">日期：</label>
        <input type="date" v-model="filterDate" class="input w-44" @change="loadTasks" />
      </div>
      <button @click="loadTasks" class="btn-secondary btn-sm ml-auto">刷新</button>
      <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
        <input type="checkbox" v-model="autoRefresh" class="rounded" />
        自动刷新
      </label>
    </div>

    <!-- Today stats bar -->
    <div class="grid grid-cols-4 gap-3">
      <div v-for="s in statItems" :key="s.label" class="card p-3 text-center">
        <div class="text-xl font-bold" :class="s.color">{{ s.value }}</div>
        <div class="text-xs text-gray-500">{{ s.label }}</div>
      </div>
    </div>

    <!-- Tasks table -->
    <div class="card overflow-hidden">
      <div v-if="loading" class="p-8 text-center text-gray-400">加载中...</div>
      <div v-else-if="tasks.length === 0" class="p-8 text-center text-gray-400">暂无任务记录</div>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-100 bg-gray-50">
            <th class="text-left px-4 py-3 font-medium text-gray-600">ID</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">频道</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">触发</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">状态</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">创建时间</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">耗时</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
          <template v-for="task in tasks" :key="task.id">
            <tr class="hover:bg-gray-50 cursor-pointer" @click="toggleExpand(task.id)">
              <td class="px-4 py-3 text-gray-400 font-mono">#{{ task.id }}</td>
              <td class="px-4 py-3 font-medium text-gray-800">{{ task.channelName || `#${task.channelId}` }}</td>
              <td class="px-4 py-3 text-gray-500">{{ triggerLabel(task.triggerType) }}</td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <span :class="statusBadge(task.status)">{{ statusLabel(task.status) }}</span>
                  <span v-if="task.status === 'running'" class="w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"></span>
                </div>
              </td>
              <td class="px-4 py-3 text-gray-400">{{ formatTime(task.createdAt) }}</td>
              <td class="px-4 py-3 text-gray-400">{{ calcDuration(task.createdAt, task.completedAt) }}</td>
              <td class="px-4 py-3 text-gray-400 text-right">
                <span class="text-xs">{{ expandedId === task.id ? '▲' : '▼' }}</span>
              </td>
            </tr>
            <!-- Expanded logs row -->
            <tr v-if="expandedId === task.id">
              <td colspan="7" class="bg-gray-900 px-4 py-3">
                <div v-if="logsLoading" class="text-gray-400 text-xs py-2">加载日志...</div>
                <div v-else-if="expandedLogs.length === 0" class="text-gray-400 text-xs py-2">暂无日志</div>
                <div v-else class="font-mono text-xs space-y-1 max-h-60 overflow-y-auto">
                  <div
                    v-for="log in expandedLogs"
                    :key="log.id"
                    class="flex gap-3"
                    :class="log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-yellow-400' : 'text-green-300'"
                  >
                    <span class="text-gray-500 flex-shrink-0">{{ log.createdAt?.split('T')[1]?.slice(0, 8) }}</span>
                    <span class="uppercase flex-shrink-0">{{ log.level }}</span>
                    <span>{{ log.message }}</span>
                  </div>
                </div>
                <div v-if="task.errorMessage" class="mt-2 text-red-400 text-xs font-mono">
                  Error: {{ task.errorMessage }}
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useChannelsStore } from '../stores/channels.js'
import { useTasksStore } from '../stores/tasks.js'
import { tasksApi, type TaskLog } from '../api/index.js'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime.js'
import 'dayjs/locale/zh-cn.js'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

const channelsStore = useChannelsStore()
const tasksStore = useTasksStore()

const channels = computed(() => channelsStore.channels)
const tasks = computed(() => tasksStore.tasks)
const stats = computed(() => tasksStore.stats)
const loading = computed(() => tasksStore.loading)

const filterChannelId = ref<number | ''>('')
const filterStatus = ref('')
const filterDate = ref('')
const autoRefresh = ref(true)
const expandedId = ref<number | null>(null)
const expandedLogs = ref<TaskLog[]>([])
const logsLoading = ref(false)

const statItems = computed(() => [
  { label: '成功', value: stats.value.done, color: 'text-green-600' },
  { label: '失败', value: stats.value.failed, color: 'text-red-600' },
  { label: '运行中', value: stats.value.running, color: 'text-yellow-600' },
  { label: '等待', value: stats.value.pending, color: 'text-gray-600' },
])

async function loadTasks() {
  const params: Record<string, string | number> = {}
  if (filterChannelId.value) params.channelId = filterChannelId.value
  if (filterStatus.value) params.status = filterStatus.value
  if (filterDate.value) params.date = filterDate.value
  await tasksStore.fetchTasks(params)
  await tasksStore.fetchStats()
}

async function toggleExpand(taskId: number) {
  if (expandedId.value === taskId) {
    expandedId.value = null
    expandedLogs.value = []
    return
  }
  expandedId.value = taskId
  expandedLogs.value = []
  logsLoading.value = true
  try {
    const res = await tasksApi.getLogs(taskId)
    expandedLogs.value = res.data
  } finally {
    logsLoading.value = false
  }
}

function statusBadge(s: string) {
  const m: Record<string, string> = { done: 'badge-green', failed: 'badge-red', running: 'badge-yellow', pending: 'badge-gray' }
  return m[s] ?? 'badge-gray'
}
function statusLabel(s: string) {
  const m: Record<string, string> = { done: '成功', failed: '失败', running: '运行中', pending: '等待' }
  return m[s] ?? s
}
function triggerLabel(t: string) {
  const m: Record<string, string> = { auto: '自动', manual: '手动', preview: '预览' }
  return m[t] ?? t
}
function formatTime(t: string) {
  return dayjs(t).format('MM-DD HH:mm:ss')
}
function calcDuration(start: string, end?: string | null) {
  if (!end) return '-'
  const ms = dayjs(end).diff(dayjs(start))
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`
  return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`
}

let timer: ReturnType<typeof setInterval>
watch(autoRefresh, (val) => {
  if (val) timer = setInterval(loadTasks, 5000)
  else clearInterval(timer)
})

onMounted(async () => {
  await channelsStore.fetchChannels()
  await loadTasks()
  if (autoRefresh.value) timer = setInterval(loadTasks, 5000)
})
onUnmounted(() => clearInterval(timer))
</script>
