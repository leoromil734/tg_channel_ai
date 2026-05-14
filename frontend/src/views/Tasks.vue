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
      <div class="ml-auto flex items-center gap-3">
        <span class="flex items-center gap-1.5 text-xs" :class="connected ? 'text-green-600' : 'text-gray-400'">
          <span class="w-2 h-2 rounded-full" :class="connected ? 'bg-green-500 animate-pulse' : 'bg-gray-300'"></span>
          {{ connected ? '实时' : '断线' }}
        </span>
        <button @click="loadTasks" class="btn-secondary btn-sm">刷新</button>
      </div>
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
            <th class="text-left px-4 py-3 font-medium text-gray-600">当前步骤</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">创建时间</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">耗时</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
          <template v-for="task in tasks" :key="task.id">
            <tr
              class="hover:bg-gray-50 cursor-pointer"
              @click="toggleExpand(task.id)"
            >
              <td class="px-4 py-3 text-gray-400 font-mono">#{{ task.id }}</td>
              <td class="px-4 py-3 font-medium text-gray-800">{{ task.channelName || `#${task.channelId}` }}</td>
              <td class="px-4 py-3 text-gray-500">{{ triggerLabel(task.triggerType) }}</td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <span :class="statusBadge(task.status)">{{ statusLabel(task.status) }}</span>
                  <span v-if="task.status === 'running'" class="w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"></span>
                </div>
              </td>
              <td class="px-4 py-3">
                <span v-if="task.currentStep" class="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded font-mono">
                  {{ stepLabel(task.currentStep) }}
                </span>
                <span v-else class="text-gray-300">-</span>
              </td>
              <td class="px-4 py-3 text-gray-400">{{ formatTime(task.createdAt) }}</td>
              <td class="px-4 py-3 text-gray-400">{{ calcDuration(task.createdAt, task.completedAt) }}</td>
              <td class="px-4 py-3 text-gray-400 text-right">
                <span class="text-xs">{{ expandedId === task.id ? '▲' : '▼' }}</span>
              </td>
            </tr>

            <!-- Expanded: workflow progress diagram -->
            <tr v-if="expandedId === task.id">
              <td colspan="8" class="bg-gray-50 px-6 py-5 border-b border-gray-100">
                <div v-if="progressLoading" class="text-gray-400 text-sm py-4 text-center">加载工作流进度...</div>
                <WorkflowProgress v-else-if="expandedProgress" :progress="expandedProgress" />
                <div v-else class="text-gray-400 text-sm py-2">暂无进度数据</div>

                <div v-if="task.errorMessage" class="mt-3 text-red-500 text-xs font-mono bg-red-50 px-3 py-2 rounded">
                  错误: {{ task.errorMessage }}
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
import { ref, computed, onMounted } from 'vue'
import { useChannelsStore } from '../stores/channels.js'
import { useTasksStore } from '../stores/tasks.js'
import { tasksApi, type TaskProgress } from '../api/index.js'
import WorkflowProgress from '../components/WorkflowProgress.vue'
import { useTaskEvents, type SSETaskEvent } from '../composables/useTaskEvents.js'
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
const expandedId = ref<number | null>(null)
const expandedProgress = ref<TaskProgress | null>(null)
const progressLoading = ref(false)

const statItems = computed(() => [
  { label: '成功', value: stats.value.done, color: 'text-green-600' },
  { label: '失败', value: stats.value.failed, color: 'text-red-600' },
  { label: '运行中', value: stats.value.running, color: 'text-yellow-600' },
  { label: '等待', value: stats.value.pending, color: 'text-gray-600' },
])

// ─── SSE real-time updates ─────────────────────────────────────────────────
const { connected } = useTaskEvents(async (event: SSETaskEvent) => {
  if (event.type === 'task:update') {
    // Update the specific task row in-place
    tasksStore.patchTask(event.taskId, {
      status: event.status,
      currentStep: event.currentStep,
      errorMessage: event.errorMessage,
    })
    // Refresh expanded progress if this task is open
    if (expandedId.value === event.taskId) {
      await loadProgress(event.taskId)
    }
  }
  if (event.type === 'task:log' && expandedId.value === event.taskId) {
    // Append log to expanded progress without full reload
    if (expandedProgress.value) {
      expandedProgress.value = {
        ...expandedProgress.value,
        logs: [...(expandedProgress.value.logs ?? []), {
          id: Date.now(),
          taskId: event.taskId,
          level: event.level as 'info' | 'warn' | 'error',
          message: event.message,
          createdAt: event.timestamp,
        }],
      }
    }
  }
  if (event.type === 'task:stats') {
    await tasksStore.fetchStats()
    // If a new task appeared (status change may mean new task), reload list
    await loadTasks()
  }
})

async function loadTasks() {
  const params: Record<string, string | number> = {}
  if (filterChannelId.value) params.channelId = filterChannelId.value
  if (filterStatus.value) params.status = filterStatus.value
  if (filterDate.value) params.date = filterDate.value
  await tasksStore.fetchTasks(params)
  await tasksStore.fetchStats()
}

async function loadProgress(taskId: number) {
  try {
    const res = await tasksApi.getProgress(taskId)
    expandedProgress.value = res.data
  } catch {
    expandedProgress.value = null
  }
}

async function toggleExpand(taskId: number) {
  if (expandedId.value === taskId) {
    expandedId.value = null
    expandedProgress.value = null
    return
  }
  expandedId.value = taskId
  expandedProgress.value = null
  progressLoading.value = true
  try {
    await loadProgress(taskId)
  } finally {
    progressLoading.value = false
  }
}

const STEP_LABELS: Record<string, string> = {
  brain: '🧠 大脑决策',
  researcher: '🔍 信息研究',
  writer: '✍️ 内容创作',
  reviewer: '🔎 审校优化',
  prompter: '🎨 提示词',
  illustrator: '🖼️ 生图',
  publishing: '📤 发布',
  done: '✅ 完成',
  failed: '❌ 失败',
}

function stepLabel(step: string): string { return STEP_LABELS[step] ?? step }
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
function formatTime(t: string) { return dayjs(t).format('MM-DD HH:mm:ss') }
function calcDuration(start: string, end?: string | null) {
  if (!end) return '-'
  const ms = dayjs(end).diff(dayjs(start))
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`
  return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`
}

onMounted(async () => {
  await channelsStore.fetchChannels()
  await loadTasks()
})
</script>
