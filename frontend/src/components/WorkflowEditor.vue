<template>
  <div class="space-y-3">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold text-gray-700">工作流节点配置</h3>
      <div class="flex gap-2">
        <button @click="resetToDefault" class="btn-secondary btn-sm">重置默认</button>
        <button @click="saveWorkflow" :disabled="saving" class="btn-primary btn-sm">
          {{ saving ? '保存中...' : '保存工作流' }}
        </button>
      </div>
    </div>

    <!-- Flow visualization -->
    <div class="flex items-stretch gap-1 overflow-x-auto pb-2">
      <template v-for="(step, i) in STEP_ORDER" :key="step.type">
        <div
          class="flex-shrink-0 w-44 rounded-xl border-2 transition-all"
          :class="[
            getNode(step.type)?.isEnabled
              ? 'border-primary-300 bg-primary-50'
              : 'border-gray-200 bg-gray-50 opacity-60',
          ]"
        >
          <div class="p-3">
            <!-- Step header -->
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-1.5">
                <span class="text-base">{{ step.icon }}</span>
                <span class="text-xs font-semibold text-gray-700">{{ step.label }}</span>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  :checked="getNode(step.type)?.isEnabled ?? false"
                  @change="toggleNode(step.type)"
                  class="sr-only peer"
                />
                <div class="w-7 h-4 bg-gray-300 rounded-full peer peer-checked:bg-primary-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-3"></div>
              </label>
            </div>

            <p class="text-xs text-gray-400 mb-2 leading-tight">{{ step.desc }}</p>

            <div v-if="getNode(step.type)?.isEnabled" class="space-y-1.5">
              <!-- Provider select -->
              <select
                :value="getNode(step.type)?.providerId ?? ''"
                @change="updateNodeField(step.type, 'providerId', parseInt(($event.target as HTMLSelectElement).value) || null)"
                class="w-full text-xs rounded border-gray-300 py-1 focus:border-primary-500 focus:ring-primary-500"
              >
                <option value="">选择提供商</option>
                <option v-for="p in providers" :key="p.id" :value="p.id">
                  {{ p.label }} ({{ PROVIDER_LABELS[p.providerType] }})
                </option>
              </select>

              <!-- Model input -->
              <input
                :value="getNode(step.type)?.model ?? ''"
                @input="updateNodeField(step.type, 'model', ($event.target as HTMLInputElement).value)"
                placeholder="输入模型名称"
                class="w-full text-xs rounded border-gray-300 py-1 focus:border-primary-500 focus:ring-primary-500"
              />

              <!-- Advanced toggle -->
              <button
                @click="toggleAdvanced(step.type)"
                class="text-xs text-primary-500 hover:underline w-full text-left"
              >
                {{ advancedOpen.has(step.type) ? '▲ 收起' : '▼ 高级设置' }}
              </button>

              <div v-if="advancedOpen.has(step.type)" class="space-y-1.5 pt-1 border-t border-gray-100">
                <div>
                  <div class="text-xs text-gray-500 mb-0.5">系统提示词</div>
                  <textarea
                    :value="getNode(step.type)?.systemPrompt ?? ''"
                    @input="updateNodeField(step.type, 'systemPrompt', ($event.target as HTMLTextAreaElement).value)"
                    rows="2"
                    placeholder="留空使用默认"
                    class="w-full text-xs rounded border-gray-300 py-1 focus:border-primary-500 focus:ring-primary-500"
                  ></textarea>
                </div>
                <div class="grid grid-cols-2 gap-1">
                  <div>
                    <div class="text-xs text-gray-500 mb-0.5">温度 {{ getNode(step.type)?.temperature?.toFixed(1) }}</div>
                    <input
                      type="range"
                      min="0" max="2" step="0.1"
                      :value="getNode(step.type)?.temperature ?? 0.8"
                      @input="updateNodeField(step.type, 'temperature', parseFloat(($event.target as HTMLInputElement).value))"
                      class="w-full"
                    />
                  </div>
                  <div>
                    <div class="text-xs text-gray-500 mb-0.5">Max Tokens</div>
                    <input
                      type="number"
                      :value="getNode(step.type)?.maxTokens ?? 2048"
                      @input="updateNodeField(step.type, 'maxTokens', parseInt(($event.target as HTMLInputElement).value))"
                      min="100" max="200000" step="100"
                      class="w-full text-xs rounded border-gray-300 py-1"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="text-xs text-gray-400 italic text-center py-1">已禁用</div>
          </div>
        </div>

        <!-- Arrow between steps -->
        <div v-if="i < STEP_ORDER.length - 1" class="flex items-center flex-shrink-0 text-gray-300 text-lg px-0.5">
          →
        </div>
      </template>
    </div>

    <!-- Legend -->
    <div class="text-xs text-gray-400 bg-gray-50 rounded-lg p-2">
      💡 <b>主大脑</b>可作为其他未配置步骤的兜底模型 &nbsp;·&nbsp;
      <b>插画师</b>节点需使用支持图片生成的模型（DALL-E 3 / Gemini Imagen）&nbsp;·&nbsp;
      至少需要配置一个<b>撰写者</b>或<b>主大脑</b>节点
    </div>

    <div v-if="saveError" class="text-xs text-red-500 bg-red-50 rounded p-2">{{ saveError }}</div>
    <div v-if="saveOk" class="text-xs text-green-600 bg-green-50 rounded p-2">✓ 工作流已保存</div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { workflowApi, type WorkflowNode, type StepType, type AiProvider } from '../api/index.js'

const props = defineProps<{ channelId: number; providers: AiProvider[] }>()

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Claude',
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
  openai_compatible: '兼容',
}

interface StepMeta {
  type: StepType
  icon: string
  label: string
  desc: string
  defaultOrder: number
  defaultEnabled: boolean
}

const STEP_ORDER: StepMeta[] = [
  { type: 'brain', icon: '🧠', label: '主大脑', desc: '内容策略与创意总指挥，其他未配置步骤的兜底', defaultOrder: 0, defaultEnabled: false },
  { type: 'researcher', icon: '🔍', label: '研究员', desc: '联网搜索最新资讯，为创作提供素材', defaultOrder: 1, defaultEnabled: true },
  { type: 'writer', icon: '✍️', label: '撰写者', desc: '根据素材撰写频道帖子正文', defaultOrder: 2, defaultEnabled: true },
  { type: 'reviewer', icon: '🔎', label: '审核员', desc: '审核并润色内容质量，优化发布效果', defaultOrder: 3, defaultEnabled: false },
  { type: 'prompter', icon: '🎨', label: '提示词', desc: '为配图生成文生图提示词', defaultOrder: 4, defaultEnabled: true },
  { type: 'illustrator', icon: '🖼️', label: '插画师', desc: '根据提示词生成配图（需图像模型）', defaultOrder: 5, defaultEnabled: true },
]

const nodes = reactive<Map<StepType, WorkflowNode>>(new Map())
const advancedOpen = ref<Set<StepType>>(new Set())
const saving = ref(false)
const saveError = ref('')
const saveOk = ref(false)

function getNode(type: StepType): WorkflowNode | undefined {
  return nodes.get(type)
}

function ensureNode(type: StepType): WorkflowNode {
  if (!nodes.has(type)) {
    const meta = STEP_ORDER.find((s) => s.type === type)!
    nodes.set(type, {
      stepType: type,
      stepOrder: meta.defaultOrder,
      providerId: null,
      model: '',
      systemPrompt: '',
      temperature: 0.8,
      maxTokens: 2048,
      isEnabled: false,
    })
  }
  return nodes.get(type)!
}

function toggleNode(type: StepType) {
  const node = ensureNode(type)
  node.isEnabled = !node.isEnabled
}

function updateNodeField<K extends keyof WorkflowNode>(type: StepType, field: K, value: WorkflowNode[K]) {
  const node = ensureNode(type)
  ;(node as unknown as Record<string, unknown>)[field as string] = value

  // When a provider is selected, auto-fill defaultModel if model is currently empty
  if (field === 'providerId' && value) {
    const provider = props.providers.find((p) => p.id === value)
    if (provider?.defaultModel && !node.model) {
      node.model = provider.defaultModel
    }
  }
}

function toggleAdvanced(type: StepType) {
  const next = new Set(advancedOpen.value)
  if (next.has(type)) next.delete(type)
  else next.add(type)
  advancedOpen.value = next
}

function resetToDefault() {
  nodes.clear()
  for (const step of STEP_ORDER) {
    nodes.set(step.type, {
      stepType: step.type,
      stepOrder: step.defaultOrder,
      providerId: null,
      model: '',
      systemPrompt: '',
      temperature: 0.8,
      maxTokens: 2048,
      isEnabled: step.defaultEnabled,
    })
  }
}

async function saveWorkflow() {
  saving.value = true
  saveError.value = ''
  saveOk.value = false
  try {
    const payload = STEP_ORDER.map((step) => {
      const node = nodes.get(step.type)
      return {
        stepType: step.type,
        stepOrder: step.defaultOrder,
        providerId: node?.providerId ?? null,
        model: node?.model ?? '',
        systemPrompt: node?.systemPrompt ?? '',
        temperature: node?.temperature ?? 0.8,
        maxTokens: node?.maxTokens ?? 2048,
        isEnabled: node?.isEnabled ?? false,
      }
    })
    await workflowApi.saveNodes(props.channelId, payload)
    saveOk.value = true
    setTimeout(() => (saveOk.value = false), 3000)
  } catch (err) {
    saveError.value = `保存失败：${(err as Error).message}`
  } finally {
    saving.value = false
  }
}

async function loadWorkflow() {
  try {
    const res = await workflowApi.getNodes(props.channelId)
    nodes.clear()
    for (const node of res.data) {
      nodes.set(node.stepType as StepType, node as WorkflowNode)
    }
    // Ensure all step types exist in the map
    for (const step of STEP_ORDER) {
      if (!nodes.has(step.type)) {
        nodes.set(step.type, {
          stepType: step.type,
          stepOrder: step.defaultOrder,
          providerId: null,
          model: '',
          systemPrompt: '',
          temperature: 0.8,
          maxTokens: 2048,
          isEnabled: step.defaultEnabled,
        })
      }
    }
  } catch {
    resetToDefault()
  }
}

onMounted(loadWorkflow)
</script>
