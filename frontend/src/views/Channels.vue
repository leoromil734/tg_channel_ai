<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold text-gray-800">频道管理</h2>
        <p class="text-sm text-gray-500 mt-0.5">管理频道信息、AI 工作流与运营配置</p>
      </div>
      <button @click="openCreate" class="btn-primary">+ 添加频道</button>
    </div>

    <div v-if="loading" class="text-center py-16 text-gray-400">加载中...</div>
    <div v-else-if="channels.length === 0" class="card p-16 text-center">
      <div class="text-5xl mb-4">📢</div>
      <p class="text-gray-600 font-medium mb-2">还没有添加任何频道</p>
      <button @click="openCreate" class="btn-primary mt-4">添加频道</button>
    </div>

    <div v-else class="space-y-4">
      <div v-for="ch in channels" :key="ch.id" class="card overflow-hidden">
        <!-- Channel header -->
        <div class="p-5">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1 flex-wrap">
                <h3 class="font-semibold text-gray-900">{{ ch.name }}</h3>
                <span :class="ch.isActive ? 'badge-green' : 'badge-gray'">{{ ch.isActive ? '活跃' : '暂停' }}</span>
                <span class="text-xs text-gray-400">{{ ch.tgChannelId }}</span>
              </div>
              <p class="text-sm text-gray-500">{{ ch.description || '暂无简介' }}</p>
              <div v-if="ch.userIntro" class="mt-1.5 text-xs text-gray-500 bg-gray-50 rounded px-2 py-1">
                <b>运营说明：</b>{{ ch.userIntro }}
              </div>
            </div>

            <div class="flex items-center gap-2 flex-shrink-0">
              <button @click="triggerRun(ch.id)" :disabled="runningIds.has(ch.id)" class="btn-primary btn-sm">
                {{ runningIds.has(ch.id) ? '运行中...' : '立即发布' }}
              </button>
              <button @click="triggerPreview(ch.id)" :disabled="previewIds.has(ch.id)" class="btn-secondary btn-sm">
                {{ previewIds.has(ch.id) ? '生成中...' : '预览' }}
              </button>
              <button @click="openEdit(ch)" class="btn-secondary btn-sm">编辑</button>
              <button @click="confirmDelete(ch)" class="btn-danger btn-sm">删除</button>
            </div>
          </div>

          <div class="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
            <span>🕐 {{ ch.scheduleCron || '未设置定时' }}</span>
            <span v-if="ch.config">🔍 搜索 {{ ch.config.searchEnabled ? '开' : '关' }}</span>
            <span v-if="ch.config">🖼️ 配图 {{ ch.config.imageEnabled ? '开' : '关' }}</span>
            <span v-if="ch.config">🌐 {{ LANG_LABELS[ch.config.language] ?? ch.config.language }}</span>
          </div>
        </div>

        <!-- Workflow section (expandable) -->
        <div class="border-t border-gray-100">
          <button
            @click="toggleWorkflow(ch.id)"
            class="w-full flex items-center justify-between px-5 py-3 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <span class="flex items-center gap-2 font-medium">
              <span>⚙️</span> AI 工作流配置
            </span>
            <span class="text-gray-400">{{ workflowOpen.has(ch.id) ? '▲ 收起' : '▼ 展开' }}</span>
          </button>

          <div v-if="workflowOpen.has(ch.id)" class="px-5 pb-5">
            <WorkflowEditor :channelId="ch.id" :providers="providers" />
          </div>
        </div>
      </div>
    </div>

    <!-- Create/Edit modal -->
    <div v-if="showModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div class="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-lg font-semibold">{{ editingChannel ? '编辑频道' : '添加频道' }}</h3>
          <button @click="closeModal" class="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <form @submit.prevent="saveChannel" class="p-6 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">频道 ID *</label>
              <input v-model="form.tgChannelId" class="input" placeholder="@channelname 或 -100xxxxxxx" required :disabled="!!editingChannel" />
            </div>
            <div>
              <label class="label">频道名称 *</label>
              <input v-model="form.name" class="input" placeholder="如：科技日报" required />
            </div>
          </div>

          <div>
            <label class="label">频道简介</label>
            <textarea v-model="form.description" class="input" rows="2" placeholder="频道内容方向"></textarea>
          </div>

          <div>
            <label class="label">运营说明（AI 创作参考）</label>
            <textarea v-model="form.userIntro" class="input" rows="3" placeholder="如：内容活泼有趣，多用 emoji，每篇结尾加互动问题"></textarea>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">定时发布（Cron）</label>
              <input v-model="form.scheduleCron" class="input" placeholder="0 9 * * *" />
              <p class="text-xs text-gray-400 mt-1">每天早9点：0 9 * * *</p>
            </div>
            <div class="flex items-end pb-1">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="form.isActive" class="rounded" />
                <span class="text-sm font-medium text-gray-700">启用频道</span>
              </label>
            </div>
          </div>

          <!-- Pipeline config -->
          <div class="border-t border-gray-100 pt-4">
            <h4 class="text-sm font-semibold text-gray-700 mb-3">内容生成配置</h4>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="label">内容风格</label>
                <select v-model="configForm.contentStyle" class="input">
                  <option value="informative">资讯型</option>
                  <option value="creative">创意型</option>
                  <option value="news">新闻型</option>
                  <option value="tech">科技型</option>
                  <option value="lifestyle">生活型</option>
                  <option value="business">商业型</option>
                  <option value="entertainment">娱乐型</option>
                </select>
              </div>
              <div>
                <label class="label">发布语言</label>
                <select v-model="configForm.language" class="input">
                  <option value="zh">中文</option>
                  <option value="en">英文</option>
                  <option value="zh-tw">繁体中文</option>
                </select>
              </div>
            </div>
            <div class="flex gap-6 mt-3">
              <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" v-model="configForm.searchEnabled" class="rounded" />
                启用网络搜索
              </label>
              <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" v-model="configForm.imageEnabled" class="rounded" />
                生成配图
              </label>
            </div>
            <div class="mt-3">
              <label class="label">自定义指令</label>
              <textarea v-model="configForm.customInstructions" class="input" rows="2" placeholder="额外补充给 AI 的创作指令"></textarea>
            </div>
          </div>

          <div class="flex justify-end gap-3 pt-2">
            <button type="button" @click="closeModal" class="btn-secondary">取消</button>
            <button type="submit" :disabled="saving" class="btn-primary">{{ saving ? '保存中...' : '保存' }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Preview modal -->
    <div v-if="previewResult" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <div class="p-5 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-lg font-semibold">内容预览（未发布）</h3>
          <button @click="previewResult = null" class="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div class="p-5">
          <img
            v-if="previewResult.imageUrl && !previewResult.imageUrl.startsWith('data:')"
            :src="previewResult.imageUrl"
            class="w-full rounded-lg mb-4 max-h-72 object-cover"
          />
          <div class="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{{ previewResult.textContent }}</div>
          <div v-if="previewResult.reviewSuggestions" class="mt-3 p-2 bg-blue-50 rounded text-xs text-blue-700">
            <b>审核意见：</b>{{ previewResult.reviewSuggestions }}
          </div>
          <div v-if="previewResult.imagePrompt" class="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-500">
            <b>图片提示词：</b>{{ previewResult.imagePrompt }}
          </div>
          <div v-if="previewResult.searchKeywords" class="mt-1 text-xs text-gray-400">
            🔍 关键词：{{ previewResult.searchKeywords }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useChannelsStore } from '../stores/channels.js'
import { channelsApi, providersApi, pipelineApi, type Channel, type AiProvider } from '../api/index.js'
import WorkflowEditor from '../components/WorkflowEditor.vue'

const store = useChannelsStore()
const channels = computed(() => store.channels)
const loading = computed(() => store.loading)

const providers = ref<AiProvider[]>([])
const workflowOpen = ref<Set<number>>(new Set())
const runningIds = ref<Set<number>>(new Set())
const previewIds = ref<Set<number>>(new Set())
const showModal = ref(false)
const editingChannel = ref<Channel | null>(null)
const saving = ref(false)
const previewResult = ref<{ textContent: string; imageUrl?: string; imagePrompt?: string; searchKeywords?: string; reviewSuggestions?: string } | null>(null)

const LANG_LABELS: Record<string, string> = { zh: '中文', en: '英文', 'zh-tw': '繁中' }

const form = reactive({
  tgChannelId: '', name: '', description: '', userIntro: '',
  scheduleCron: '0 9 * * *', isActive: true,
})

const configForm = reactive({
  contentStyle: 'informative', language: 'zh',
  searchEnabled: true, imageEnabled: true, customInstructions: '',
})

function toggleWorkflow(channelId: number) {
  const next = new Set(workflowOpen.value)
  if (next.has(channelId)) next.delete(channelId)
  else next.add(channelId)
  workflowOpen.value = next
}

function openCreate() {
  editingChannel.value = null
  Object.assign(form, { tgChannelId: '', name: '', description: '', userIntro: '', scheduleCron: '0 9 * * *', isActive: true })
  Object.assign(configForm, { contentStyle: 'informative', language: 'zh', searchEnabled: true, imageEnabled: true, customInstructions: '' })
  showModal.value = true
}

function openEdit(ch: Channel) {
  editingChannel.value = ch
  Object.assign(form, { tgChannelId: ch.tgChannelId, name: ch.name, description: ch.description, userIntro: ch.userIntro, scheduleCron: ch.scheduleCron, isActive: ch.isActive })
  if (ch.config) Object.assign(configForm, ch.config)
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingChannel.value = null
}

async function saveChannel() {
  saving.value = true
  try {
    if (editingChannel.value) {
      await store.updateChannel(editingChannel.value.id, { name: form.name, description: form.description, userIntro: form.userIntro, scheduleCron: form.scheduleCron, isActive: form.isActive })
      await store.updateConfig(editingChannel.value.id, configForm)
    } else {
      const created = await store.createChannel(form)
      await store.updateConfig(created.id, configForm)
    }
    closeModal()
    await store.fetchChannels()
    for (const ch of channels.value) {
      try { const res = await channelsApi.getConfig(ch.id); ch.config = res.data } catch {}
    }
  } catch (err) {
    alert(`保存失败：${(err as Error).message}`)
  } finally {
    saving.value = false
  }
}

async function confirmDelete(ch: Channel) {
  if (!confirm(`确定删除「${ch.name}」？`)) return
  await store.deleteChannel(ch.id)
}

async function triggerRun(channelId: number) {
  runningIds.value = new Set([...runningIds.value, channelId])
  try {
    await pipelineApi.run(channelId)
    alert('内容发布成功！')
  } catch (err) {
    alert(`失败：${(err as Error).message}`)
  } finally {
    const next = new Set(runningIds.value); next.delete(channelId); runningIds.value = next
  }
}

async function triggerPreview(channelId: number) {
  previewIds.value = new Set([...previewIds.value, channelId])
  try {
    const res = await pipelineApi.run(channelId, true)
    previewResult.value = res.data.result
  } catch (err) {
    alert(`预览失败：${(err as Error).message}`)
  } finally {
    const next = new Set(previewIds.value); next.delete(channelId); previewIds.value = next
  }
}

onMounted(async () => {
  await store.fetchChannels()
  const provRes = await providersApi.list()
  providers.value = provRes.data
  for (const ch of channels.value) {
    try { const res = await channelsApi.getConfig(ch.id); ch.config = res.data } catch {}
  }
})
</script>
