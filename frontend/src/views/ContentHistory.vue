<template>
  <div class="space-y-5">
    <!-- Filters -->
    <div class="card p-4 flex flex-wrap gap-3 items-end">
      <div>
        <label class="label">频道</label>
        <select v-model="filterChannelId" class="input w-44" @change="() => loadContent()">
          <option value="">全部频道</option>
          <option v-for="ch in channels" :key="ch.id" :value="ch.id">{{ ch.name }}</option>
        </select>
      </div>
      <div>
        <label class="label">开始日期</label>
        <input type="date" v-model="filterDateFrom" class="input w-44" @change="() => loadContent()" />
      </div>
      <div>
        <label class="label">结束日期</label>
        <input type="date" v-model="filterDateTo" class="input w-44" @change="() => loadContent()" />
      </div>
      <button @click="() => loadContent()" class="btn-secondary">刷新</button>
    </div>

    <div class="text-sm text-gray-500">共 {{ items.length }} 条记录</div>

    <div v-if="loading" class="text-center py-16 text-gray-400">加载中...</div>
    <div v-else-if="items.length === 0" class="card p-16 text-center">
      <div class="text-4xl mb-3">📝</div>
      <p class="text-gray-500">暂无内容历史</p>
    </div>

    <div v-else class="space-y-4">
      <div v-for="item in items" :key="item.id" class="card overflow-hidden hover:shadow-md transition-shadow">
        <div class="p-5">
          <div class="flex items-start gap-4">
            <!-- Image thumbnail -->
            <div v-if="item.imageUrl && !item.imageUrl.startsWith('data:')" class="flex-shrink-0">
              <img
                :src="item.imageUrl"
                class="w-24 h-24 rounded-lg object-cover cursor-pointer"
                @click="viewImage(item.imageUrl!)"
              />
            </div>
            <div v-else-if="item.imageUrl && item.imageUrl.startsWith('data:')" class="flex-shrink-0">
              <img
                :src="item.imageUrl"
                class="w-24 h-24 rounded-lg object-cover cursor-pointer"
                @click="viewImage(item.imageUrl!)"
              />
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-2">
                <span class="font-medium text-gray-800">{{ item.channelName || `频道 #${item.channelId}` }}</span>
                <span v-if="item.isPreview" class="badge-yellow">预览</span>
                <span class="text-xs text-gray-400 ml-auto">{{ formatTime(item.createdAt) }}</span>
              </div>

              <div
                class="text-sm text-gray-700 leading-relaxed"
                :class="expandedItems.has(item.id) ? '' : 'line-clamp-3'"
              >
                {{ item.textContent }}
              </div>

              <button
                @click="toggleExpand(item.id)"
                class="text-xs text-primary-600 hover:underline mt-1"
              >
                {{ expandedItems.has(item.id) ? '收起' : '展开全文' }}
              </button>

              <div class="flex flex-wrap gap-4 mt-3 text-xs text-gray-400">
                <span v-if="item.searchKeywords">🔍 {{ item.searchKeywords }}</span>
                <span v-if="item.tgMessageId">📨 消息 ID: {{ item.tgMessageId }}</span>
                <span v-if="item.taskId">任务 #{{ item.taskId }}</span>
              </div>

              <div v-if="item.imagePrompt && expandedItems.has(item.id)" class="mt-3 p-2 bg-gray-50 rounded text-xs text-gray-500">
                <span class="font-medium">图片提示词：</span>{{ item.imagePrompt }}
              </div>
            </div>

            <div class="flex-shrink-0">
              <button @click="confirmDelete(item.id)" class="text-gray-300 hover:text-red-500 transition-colors text-lg">✕</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Load more -->
    <div v-if="items.length > 0 && items.length % 20 === 0" class="text-center">
      <button @click="loadMore" :disabled="loadingMore" class="btn-secondary">
        {{ loadingMore ? '加载中...' : '加载更多' }}
      </button>
    </div>

    <!-- Image viewer -->
    <div v-if="viewingImage" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50" @click="viewingImage = null">
      <img :src="viewingImage" class="max-w-[90vw] max-h-[90vh] rounded-lg" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useChannelsStore } from '../stores/channels.js'
import { contentApi, type ContentItem } from '../api/index.js'
import dayjs from 'dayjs'

const channelsStore = useChannelsStore()
const channels = computed(() => channelsStore.channels)

const items = ref<ContentItem[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const filterChannelId = ref<number | ''>('')
const filterDateFrom = ref('')
const filterDateTo = ref('')
const expandedItems = ref<Set<number>>(new Set())
const viewingImage = ref<string | null>(null)
const offset = ref(0)

async function loadContent(reset = true) {
  if (reset) offset.value = 0
  loading.value = true
  try {
    const res = await contentApi.list({
      channelId: filterChannelId.value || undefined,
      dateFrom: filterDateFrom.value || undefined,
      dateTo: filterDateTo.value || undefined,
      limit: 20,
      offset: offset.value,
    })
    items.value = reset ? res.data : [...items.value, ...res.data]
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  offset.value += 20
  loadingMore.value = true
  try {
    const res = await contentApi.list({
      channelId: filterChannelId.value || undefined,
      dateFrom: filterDateFrom.value || undefined,
      dateTo: filterDateTo.value || undefined,
      limit: 20,
      offset: offset.value,
    })
    items.value = [...items.value, ...res.data]
  } finally {
    loadingMore.value = false
  }
}

function toggleExpand(id: number) {
  const next = new Set(expandedItems.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  expandedItems.value = next
}

function viewImage(url: string) {
  viewingImage.value = url
}

async function confirmDelete(id: number) {
  if (!confirm('确定删除这条内容记录？')) return
  await contentApi.delete(id)
  items.value = items.value.filter((i) => i.id !== id)
}

function formatTime(t: string) {
  return dayjs(t).format('YYYY-MM-DD HH:mm')
}

onMounted(async () => {
  await channelsStore.fetchChannels()
  await loadContent()
})
</script>
