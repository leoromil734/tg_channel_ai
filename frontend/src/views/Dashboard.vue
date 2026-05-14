<template>
  <div class="space-y-6">
    <!-- Stats cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="card p-5">
        <div class="text-sm text-gray-500 mb-1">今日任务</div>
        <div class="text-3xl font-bold text-gray-900">{{ stats.total }}</div>
        <div class="text-xs text-gray-400 mt-1">总计</div>
      </div>
      <div class="card p-5">
        <div class="text-sm text-gray-500 mb-1">成功发布</div>
        <div class="text-3xl font-bold text-green-600">{{ stats.done }}</div>
        <div class="text-xs text-gray-400 mt-1">篇内容</div>
      </div>
      <div class="card p-5">
        <div class="text-sm text-gray-500 mb-1">失败任务</div>
        <div class="text-3xl font-bold text-red-600">{{ stats.failed }}</div>
        <div class="text-xs text-gray-400 mt-1">需要检查</div>
      </div>
      <div class="card p-5">
        <div class="text-sm text-gray-500 mb-1">活跃频道</div>
        <div class="text-3xl font-bold text-primary-600">{{ activeChannelCount }}</div>
        <div class="text-xs text-gray-400 mt-1">共 {{ channels.length }} 个</div>
      </div>
    </div>

    <!-- Channel status grid -->
    <div>
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-base font-semibold text-gray-800">频道状态</h2>
        <router-link to="/channels" class="text-sm text-primary-600 hover:underline">管理频道 →</router-link>
      </div>

      <div v-if="channelsLoading" class="text-center py-10 text-gray-400">加载中...</div>
      <div v-else-if="channels.length === 0" class="card p-10 text-center">
        <div class="text-4xl mb-3">📭</div>
        <p class="text-gray-500 mb-4">还没有管理的频道</p>
        <router-link to="/channels" class="btn-primary">添加第一个频道</router-link>
      </div>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="ch in channels"
          :key="ch.id"
          class="card p-5 hover:shadow-md transition-shadow"
        >
          <div class="flex items-start justify-between mb-3">
            <div class="flex-1 min-w-0">
              <div class="font-semibold text-gray-900 truncate">{{ ch.name }}</div>
              <div class="text-xs text-gray-400 mt-0.5">{{ ch.tgChannelId }}</div>
            </div>
            <span :class="ch.isActive ? 'badge-green' : 'badge-gray'">
              {{ ch.isActive ? '运行中' : '已暂停' }}
            </span>
          </div>
          <p class="text-sm text-gray-500 line-clamp-2 mb-3">{{ ch.description || '暂无简介' }}</p>
          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-400">🕐 {{ ch.scheduleCron || '未设置' }}</span>
            <button
              @click="triggerRun(ch.id, ch.name)"
              :disabled="runningIds.has(ch.id)"
              class="btn-primary btn-sm"
            >
              {{ runningIds.has(ch.id) ? '运行中...' : '立即运行' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent tasks -->
    <div>
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-base font-semibold text-gray-800">最近任务</h2>
        <router-link to="/tasks" class="text-sm text-primary-600 hover:underline">查看全部 →</router-link>
      </div>
      <div class="card overflow-hidden">
        <div v-if="tasksLoading" class="p-6 text-center text-gray-400">加载中...</div>
        <div v-else-if="recentTasks.length === 0" class="p-6 text-center text-gray-400">暂无任务记录</div>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-100 bg-gray-50">
              <th class="text-left px-4 py-3 font-medium text-gray-600">频道</th>
              <th class="text-left px-4 py-3 font-medium text-gray-600">触发方式</th>
              <th class="text-left px-4 py-3 font-medium text-gray-600">状态</th>
              <th class="text-left px-4 py-3 font-medium text-gray-600">时间</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            <tr v-for="task in recentTasks" :key="task.id" class="hover:bg-gray-50">
              <td class="px-4 py-3 font-medium text-gray-800">{{ task.channelName || `#${task.channelId}` }}</td>
              <td class="px-4 py-3 text-gray-500">{{ triggerLabel(task.triggerType) }}</td>
              <td class="px-4 py-3">
                <span :class="statusBadge(task.status)">{{ statusLabel(task.status) }}</span>
              </td>
              <td class="px-4 py-3 text-gray-400">{{ formatTime(task.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useChannelsStore } from '../stores/channels.js'
import { useTasksStore } from '../stores/tasks.js'
import { pipelineApi } from '../api/index.js'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime.js'
import 'dayjs/locale/zh-cn.js'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

const channelsStore = useChannelsStore()
const tasksStore = useTasksStore()

const channels = computed(() => channelsStore.channels)
const channelsLoading = computed(() => channelsStore.loading)
const stats = computed(() => tasksStore.stats)
const tasksLoading = computed(() => tasksStore.loading)
const recentTasks = computed(() => tasksStore.tasks.slice(0, 10))
const activeChannelCount = computed(() => channels.value.filter((c) => c.isActive).length)
const runningIds = ref<Set<number>>(new Set())

async function triggerRun(channelId: number, name: string) {
  runningIds.value = new Set([...runningIds.value, channelId])
  try {
    await pipelineApi.run(channelId)
    await tasksStore.fetchTasks()
    await tasksStore.fetchStats()
    alert(`「${name}」内容发布成功！`)
  } catch (err) {
    alert(`运行失败：${(err as Error).message}`)
  } finally {
    const next = new Set(runningIds.value)
    next.delete(channelId)
    runningIds.value = next
  }
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    done: 'badge-green', failed: 'badge-red', running: 'badge-yellow', pending: 'badge-gray',
  }
  return map[status] ?? 'badge-gray'
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    done: '成功', failed: '失败', running: '运行中', pending: '等待',
  }
  return map[status] ?? status
}

function triggerLabel(type: string) {
  const map: Record<string, string> = { auto: '自动', manual: '手动', preview: '预览' }
  return map[type] ?? type
}

function formatTime(t: string) {
  return dayjs(t).fromNow()
}

onMounted(async () => {
  await Promise.all([
    channelsStore.fetchChannels(),
    tasksStore.fetchTasks(),
    tasksStore.fetchStats(),
  ])
})
</script>
