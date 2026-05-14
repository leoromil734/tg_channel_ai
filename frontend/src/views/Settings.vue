<template>
  <div class="space-y-6 max-w-4xl">
    <div>
      <h2 class="text-lg font-semibold text-gray-800">系统设置</h2>
      <p class="text-sm text-gray-500 mt-0.5">管理 AI 提供商密钥、配置访问权限</p>
    </div>

    <!-- API Access -->
    <div class="card p-6 space-y-4">
      <h3 class="text-base font-semibold text-gray-800">管理面板访问密钥</h3>
      <div class="flex gap-2">
        <input
          v-model="apiSecret"
          :type="showSecret ? 'text' : 'password'"
          class="input flex-1"
          placeholder="输入 backend API_SECRET 的值"
        />
        <button @click="showSecret = !showSecret" class="btn-secondary">{{ showSecret ? '隐藏' : '显示' }}</button>
        <button @click="saveSecret" class="btn-primary">保存</button>
      </div>
      <p class="text-xs text-gray-400">此值存储在浏览器本地，用于调用后端 API</p>
    </div>

    <!-- AI Providers -->
    <div class="card p-6 space-y-5">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-base font-semibold text-gray-800">AI 提供商管理</h3>
          <p class="text-xs text-gray-400 mt-0.5">添加多个提供商，可在各频道工作流中按节点独立选择</p>
        </div>
        <button @click="openAddProvider" class="btn-primary btn-sm">+ 添加提供商</button>
      </div>

      <!-- Providers list -->
      <div v-if="providers.length === 0" class="text-center py-8 text-gray-400">
        <div class="text-3xl mb-2">🔑</div>
        <p>还没有配置任何 AI 提供商</p>
      </div>
      <div v-else class="space-y-3">
        <div
          v-for="p in providers"
          :key="p.id"
          class="rounded-xl border border-gray-200 hover:border-gray-300 transition-colors overflow-hidden"
          :class="p.isEnabled ? '' : 'opacity-60'"
        >
          <!-- Provider row -->
          <div class="flex items-center gap-4 p-4">
            <div
              class="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
              :class="PROVIDER_COLORS[p.providerType]"
            >
              {{ PROVIDER_ICONS[p.providerType] }}
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-medium text-gray-800">{{ p.label }}</span>
                <span class="badge badge-gray text-xs">{{ PROVIDER_LABELS[p.providerType] }}</span>
                <span v-if="p.defaultModel" class="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono">{{ p.defaultModel }}</span>
                <span v-if="!p.isEnabled" class="badge badge-red text-xs">已禁用</span>
              </div>
              <div v-if="p.baseUrl" class="text-xs text-gray-400 mt-0.5 truncate">{{ p.baseUrl }}</div>
              <div v-if="!p.defaultModel" class="text-xs text-yellow-600 mt-0.5">⚠ 未设置默认模型 — 请编辑填写</div>
            </div>

            <div class="flex items-center gap-2 flex-shrink-0">
              <label class="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" :checked="p.isEnabled" @change="toggleProvider(p)" class="rounded" />
                启用
              </label>
              <button @click="testProvider(p)" :disabled="testingId === p.id" class="btn-secondary btn-sm">
                {{ testingId === p.id ? '测试中...' : '测试' }}
              </button>
              <button
                v-if="isImageModel(p.defaultModel)"
                @click="openImageTest(p)"
                class="btn-secondary btn-sm text-purple-700 border-purple-200 hover:border-purple-400"
              >
                🖼 测试生图
              </button>
              <button @click="openEditProvider(p)" class="btn-secondary btn-sm">编辑</button>
              <button @click="deleteProvider(p)" class="btn-danger btn-sm">删除</button>
            </div>
          </div>

          <!-- Test result (inside v-for so p is in scope) -->
          <div
            v-if="testResults[p.id]"
            class="px-4 py-2 text-xs border-t"
            :class="testResults[p.id].ok ? 'bg-green-50 text-green-800 border-green-100' : 'bg-red-50 text-red-800 border-red-100'"
          >
            <span v-if="testResults[p.id].ok">
              ✅ 可用 · {{ testResults[p.id].latency }}ms · 模型: {{ testResults[p.id].model }} · 返回: "{{ testResults[p.id].response }}"
            </span>
            <span v-else>
              ❌ 不可用 · {{ testResults[p.id].latency }}ms · {{ testResults[p.id].error }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick reference -->
    <div class="card p-6 space-y-3">
      <h3 class="text-base font-semibold text-gray-800">各提供商常用模型参考</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="ref in MODEL_REFS" :key="ref.provider" class="bg-gray-50 rounded-lg p-3">
          <div class="flex items-center gap-2 mb-2">
            <div class="w-5 h-5 rounded flex items-center justify-center text-white text-xs" :class="ref.color">{{ ref.icon }}</div>
            <span class="text-sm font-medium text-gray-700">{{ ref.provider }}</span>
          </div>
          <div class="space-y-0.5">
            <div v-for="m in ref.models" :key="m.id" class="flex items-center justify-between text-xs">
              <code class="text-gray-600 select-all cursor-pointer" @click="copyText(m.id)" title="点击复制">{{ m.id }}</code>
              <span class="text-gray-400 ml-2 flex-shrink-0">{{ m.note }}</span>
            </div>
          </div>
        </div>
      </div>
      <p class="text-xs text-gray-400">点击模型 ID 可复制 · 模型名称需手动输入到工作流节点中</p>
    </div>

    <!-- Provider add/edit modal -->
    <div v-if="showProviderModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div class="p-5 border-b border-gray-100">
          <h3 class="text-base font-semibold">{{ editingProvider ? '编辑提供商' : '添加 AI 提供商' }}</h3>
        </div>
        <form @submit.prevent="saveProvider" class="p-5 space-y-4">
          <div>
            <label class="label">名称标签 *</label>
            <input v-model="providerForm.label" class="input" placeholder="如：我的 GPT-4o、公司 Claude" required />
          </div>

          <div>
            <label class="label">提供商类型 *</label>
            <select v-model="providerForm.providerType" class="input">
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="gemini">Google Gemini</option>
              <option value="deepseek">DeepSeek</option>
              <option value="openai_compatible">OpenAI 兼容接口（其他）</option>
            </select>
          </div>

          <div>
            <label class="label">API Key *</label>
            <input
              v-model="providerForm.apiKey"
              type="password"
              class="input"
              :placeholder="editingProvider ? '留空保持不变' : 'sk-... / AIza... / sk-ant-...'"
              :required="!editingProvider"
            />
          </div>

          <div>
            <label class="label">
              默认模型型号 *
              <span class="text-xs text-gray-400 font-normal ml-1">（工作流节点会自动预填此值）</span>
            </label>
            <input
              v-model="providerForm.defaultModel"
              class="input"
              :placeholder="DEFAULT_MODEL_PLACEHOLDERS[providerForm.providerType]"
            />
            <p class="text-xs text-gray-400 mt-1">
              可在下方「常用模型参考」复制模型 ID 填入 ·
              <span class="text-blue-600">同一提供商在不同工作流节点可使用不同型号</span>
            </p>
          </div>

          <div>
            <label class="label">
              自定义 Base URL
              <span class="text-xs text-gray-400 font-normal ml-1">（可选，用于代理或自托管端点）</span>
            </label>
            <input
              v-model="providerForm.baseUrl"
              class="input"
              :placeholder="BASE_URL_PLACEHOLDERS[providerForm.providerType]"
            />
            <p class="text-xs text-gray-400 mt-1">{{ BASE_URL_HINTS[providerForm.providerType] }}</p>
          </div>

          <div class="flex items-center gap-2">
            <input type="checkbox" v-model="providerForm.isEnabled" id="provEnabled" class="rounded" />
            <label for="provEnabled" class="text-sm text-gray-700 cursor-pointer">启用此提供商</label>
          </div>

          <div class="flex justify-end gap-3 pt-2">
            <button type="button" @click="closeProviderModal" class="btn-secondary">取消</button>
            <button type="submit" :disabled="saving" class="btn-primary">
              {{ saving ? '保存中...' : '保存' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Research Tools section -->
    <div class="card p-6 space-y-4">
      <h3 class="text-base font-semibold text-gray-800">研究工具配置（可选）</h3>
      <p class="text-xs text-gray-500">以下 API Key 配置在 <code class="bg-gray-100 px-1 rounded">backend/.env</code> 中，无 Key 系统自动降级使用免费方案。</p>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-gray-50 rounded-lg p-4 space-y-2">
          <div class="flex items-center gap-2">
            <span class="text-lg">🔍</span>
            <span class="font-medium text-sm">Tavily Search</span>
            <span class="badge-green">推荐</span>
          </div>
          <p class="text-xs text-gray-500">结构化搜索，质量最佳<br /><code>TAVILY_API_KEY</code></p>
          <a href="https://tavily.com" target="_blank" class="text-xs text-primary-600 hover:underline">→ 免费申请</a>
        </div>
        <div class="bg-gray-50 rounded-lg p-4 space-y-2">
          <div class="flex items-center gap-2">
            <span class="text-lg">📄</span>
            <span class="font-medium text-sm">Jina AI Reader</span>
            <span class="badge-blue">网页抓取</span>
          </div>
          <p class="text-xs text-gray-500">免 Bot 检测网页解析<br /><code>JINA_API_KEY</code>（无 Key 限速可用）</p>
          <a href="https://jina.ai" target="_blank" class="text-xs text-primary-600 hover:underline">→ 申请 Key</a>
        </div>
        <div class="bg-gray-50 rounded-lg p-4 space-y-2">
          <div class="flex items-center gap-2">
            <span class="text-lg">📰</span>
            <span class="font-medium text-sm">NewsAPI</span>
            <span class="badge-gray">可选</span>
          </div>
          <p class="text-xs text-gray-500">结构化新闻聚合<br /><code>NEWS_API_KEY</code>（无 Key 自动 RSS）</p>
          <a href="https://newsapi.org" target="_blank" class="text-xs text-primary-600 hover:underline">→ 免费申请</a>
        </div>
      </div>
      <div class="bg-blue-50 rounded-lg p-3 text-xs text-blue-800 space-y-1">
        <p>⚙️ <b>工具自动降级链：</b>Tavily → DuckDuckGo → Bing 搜索（无需 Key）</p>
        <p>🧠 <b>主大脑节点</b>会自主决策选用：search / scrape / rss / wikipedia / trending / news 6 种工具</p>
      </div>
    </div>

    <!-- Image test modal -->
    <div v-if="showImageTestModal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div class="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 class="text-base font-semibold">图片生成测试</h3>
            <p class="text-xs text-gray-400 mt-0.5">提供商：{{ imageTestProvider?.label }} · 模型：{{ imageTestProvider?.defaultModel }}</p>
          </div>
          <button @click="closeImageTest" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div class="p-5 space-y-4">
          <div>
            <label class="label">图片描述 Prompt</label>
            <textarea
              v-model="imageTestPrompt"
              class="input h-24 resize-none"
              placeholder="描述你想生成的图片，建议用英文获得最佳效果..."
            />
          </div>

          <button
            @click="runImageTest"
            :disabled="imageTestLoading"
            class="btn-primary w-full"
          >
            {{ imageTestLoading ? '生成中，请稍候（约 10-30s）...' : '开始生成' }}
          </button>

          <!-- Result -->
          <div v-if="imageTestResult">
            <div v-if="imageTestResult.ok" class="space-y-3">
              <div class="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
                ✅ 生成成功 · {{ imageTestResult.latency }}ms · 模型: {{ imageTestResult.model }}
              </div>
              <img
                v-if="imageTestResult.imageData"
                :src="imageTestResult.imageData"
                alt="Generated image"
                class="w-full rounded-xl border border-gray-200 shadow"
              />
            </div>
            <div v-else class="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">
              ❌ 生成失败 · {{ imageTestResult.latency }}ms<br />
              <span class="font-mono break-all">{{ imageTestResult.error }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Copy toast -->
    <div
      v-if="copyToast"
      class="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-4 py-2 rounded-full shadow-lg z-50"
    >
      已复制 {{ copyToast }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { providersApi, type AiProvider, type ProviderType, type ProviderTestResult, type ProviderImageTestResult } from '../api/index.js'

const apiSecret = ref(localStorage.getItem('api_secret') ?? '')
const showSecret = ref(false)
const providers = ref<AiProvider[]>([])
const saving = ref(false)
const showProviderModal = ref(false)
const editingProvider = ref<AiProvider | null>(null)
const copyToast = ref('')
const testingId = ref<number | null>(null)
const testResults = ref<Record<number, ProviderTestResult>>({})

// Image test modal state
const showImageTestModal = ref(false)
const imageTestProvider = ref<AiProvider | null>(null)
const imageTestPrompt = ref('')
const imageTestLoading = ref(false)
const imageTestResult = ref<ProviderImageTestResult | null>(null)

const providerForm = reactive({
  label: '',
  providerType: 'openai' as ProviderType,
  apiKey: '',
  baseUrl: '',
  defaultModel: '',
  isEnabled: true,
})

const DEFAULT_MODEL_PLACEHOLDERS: Record<string, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-5',
  gemini: 'gemini-2.0-flash',
  deepseek: 'deepseek-chat',
  openai_compatible: '填入该平台支持的模型 ID，如 qwen-plus',
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  deepseek: 'DeepSeek',
  openai_compatible: 'OpenAI 兼容',
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: 'bg-gray-900',
  anthropic: 'bg-orange-500',
  gemini: 'bg-blue-500',
  deepseek: 'bg-indigo-600',
  openai_compatible: 'bg-teal-600',
}

const BASE_URL_PLACEHOLDERS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  gemini: '（Gemini 暂不支持自定义端点）',
  deepseek: 'https://api.deepseek.com',
  openai_compatible: 'https://your-endpoint.com/v1',
}

const BASE_URL_HINTS: Record<string, string> = {
  openai: '留空使用官方地址；可填入中转代理，如 https://your-proxy.com/v1',
  anthropic: '留空使用官方地址；可填入中转代理地址',
  gemini: 'Gemini 官方 SDK 暂不支持自定义端点，如需代理请使用 openai_compatible 类型',
  deepseek: '留空使用 https://api.deepseek.com（官方）',
  openai_compatible: '必填。填入兼容 OpenAI 格式的完整端点，如 https://api.siliconflow.cn/v1',
}

const PROVIDER_ICONS: Record<string, string> = {
  openai: '⚡',
  anthropic: '◆',
  gemini: 'G',
  deepseek: 'D',
  openai_compatible: '~',
}

const MODEL_REFS = [
  {
    provider: 'OpenAI',
    icon: '⚡',
    color: 'bg-gray-900',
    models: [
      { id: 'gpt-4o', note: '旗舰文本' },
      { id: 'gpt-4o-mini', note: '快速便宜' },
      { id: 'dall-e-3', note: '图像生成' },
      { id: 'gpt-4.1', note: '最新旗舰' },
    ],
  },
  {
    provider: 'Anthropic Claude',
    icon: '◆',
    color: 'bg-orange-500',
    models: [
      { id: 'claude-opus-4-5', note: '最强推理' },
      { id: 'claude-sonnet-4-5', note: '均衡' },
      { id: 'claude-3-5-haiku-20241022', note: '快速' },
    ],
  },
  {
    provider: 'Google Gemini',
    icon: 'G',
    color: 'bg-blue-500',
    models: [
      { id: 'gemini-2.0-flash', note: '快速文本' },
      { id: 'gemini-1.5-pro', note: '长上下文' },
      { id: 'gemini-2.0-flash-preview-image-generation', note: '图像生成' },
    ],
  },
  {
    provider: 'DeepSeek',
    icon: 'D',
    color: 'bg-indigo-600',
    models: [
      { id: 'deepseek-chat', note: 'V3，便宜强大' },
      { id: 'deepseek-reasoner', note: 'R1，深度推理' },
    ],
  },
  {
    provider: 'OpenAI 兼容（示例）',
    icon: '~',
    color: 'bg-teal-600',
    models: [
      { id: 'qwen-plus', note: '阿里通义' },
      { id: 'moonshot-v1-8k', note: '月之暗面' },
      { id: 'glm-4-flash', note: '智谱 GLM' },
    ],
  },
]

function saveSecret() {
  localStorage.setItem('api_secret', apiSecret.value)
  alert('已保存到浏览器本地存储')
}

function openAddProvider() {
  editingProvider.value = null
  Object.assign(providerForm, { label: '', providerType: 'openai', apiKey: '', baseUrl: '', defaultModel: '', isEnabled: true })
  showProviderModal.value = true
}

function openEditProvider(p: AiProvider) {
  editingProvider.value = p
  Object.assign(providerForm, { label: p.label, providerType: p.providerType, apiKey: '', baseUrl: p.baseUrl ?? '', defaultModel: p.defaultModel ?? '', isEnabled: p.isEnabled })
  showProviderModal.value = true
}

function closeProviderModal() {
  showProviderModal.value = false
  editingProvider.value = null
}

async function saveProvider() {
  saving.value = true
  try {
    if (editingProvider.value) {
      const updateData: Record<string, unknown> = {
        label: providerForm.label,
        providerType: providerForm.providerType,
        baseUrl: providerForm.baseUrl,
        defaultModel: providerForm.defaultModel,
        isEnabled: providerForm.isEnabled,
      }
      if (providerForm.apiKey) updateData.apiKey = providerForm.apiKey
      await providersApi.update(editingProvider.value.id, updateData)
    } else {
      await providersApi.create({
        label: providerForm.label,
        providerType: providerForm.providerType,
        apiKey: providerForm.apiKey,
        baseUrl: providerForm.baseUrl || undefined,
        defaultModel: providerForm.defaultModel,
        isEnabled: providerForm.isEnabled,
      })
    }
    await loadProviders()
    closeProviderModal()
  } catch (err) {
    alert(`保存失败：${(err as Error).message}`)
  } finally {
    saving.value = false
  }
}

async function toggleProvider(p: AiProvider) {
  await providersApi.update(p.id, { isEnabled: !p.isEnabled })
  await loadProviders()
}

async function deleteProvider(p: AiProvider) {
  if (!confirm(`确定删除提供商「${p.label}」？已配置此提供商的工作流节点将失效。`)) return
  await providersApi.delete(p.id)
  await loadProviders()
}

async function testProvider(p: AiProvider) {
  if (!p.defaultModel) {
    alert('请先填写默认模型型号再测试')
    return
  }
  testingId.value = p.id
  try {
    const res = await providersApi.test(p.id)
    testResults.value = { ...testResults.value, [p.id]: res.data }
  } catch (err) {
    testResults.value = {
      ...testResults.value,
      [p.id]: { ok: false, latency: 0, model: p.defaultModel, providerType: p.providerType, label: p.label, error: (err as Error).message },
    }
  } finally {
    testingId.value = null
  }
}

function isImageModel(model?: string): boolean {
  if (!model) return false
  const m = model.toLowerCase()
  return m.startsWith('gpt-image') || m.startsWith('dall-e') || m.includes('image-generation')
}

function openImageTest(p: AiProvider) {
  imageTestProvider.value = p
  imageTestPrompt.value = ''
  imageTestResult.value = null
  showImageTestModal.value = true
}

function closeImageTest() {
  showImageTestModal.value = false
  imageTestProvider.value = null
  imageTestResult.value = null
}

async function runImageTest() {
  if (!imageTestProvider.value) return
  imageTestLoading.value = true
  imageTestResult.value = null
  try {
    const res = await providersApi.testImage(imageTestProvider.value.id, imageTestPrompt.value || undefined)
    imageTestResult.value = res.data
  } catch (err) {
    imageTestResult.value = { ok: false, latency: 0, model: imageTestProvider.value.defaultModel ?? '', error: (err as Error).message }
  } finally {
    imageTestLoading.value = false
  }
}

async function loadProviders() {
  try {
    const res = await providersApi.list()
    providers.value = res.data
  } catch {}
}

function copyText(text: string) {
  navigator.clipboard.writeText(text).then(() => {
    copyToast.value = text
    setTimeout(() => (copyToast.value = ''), 2000)
  })
}

onMounted(loadProviders)
</script>
