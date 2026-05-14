<template>
  <div class="workflow-progress">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-gray-700">工作流进度</span>
        <span v-if="isRunning" class="flex items-center gap-1 text-xs text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">
          <span class="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse"></span>
          运行中
        </span>
        <span v-else-if="isFailed" class="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">失败</span>
        <span v-else-if="isDone" class="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">已完成</span>
      </div>
      <span class="text-xs text-gray-400">
        {{ duration }}
      </span>
    </div>

    <!-- Pipeline diagram -->
    <div class="overflow-x-auto pb-2">
      <div class="flex items-start gap-0 min-w-max">
        <template v-for="(step, idx) in pipelineSteps" :key="step.id">
          <!-- Step node -->
          <div
            class="flex flex-col items-center w-28 relative"
            :class="{ 'opacity-40': step.status === 'skipped' }"
          >
            <!-- Node circle -->
            <div
              class="w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-all duration-300 relative"
              :class="nodeClass(step.status)"
            >
              {{ step.icon }}
              <!-- Spinning ring for running -->
              <div
                v-if="step.status === 'running'"
                class="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-400 animate-spin"
              ></div>
            </div>

            <!-- Step label -->
            <div class="mt-2 text-center">
              <div class="text-xs font-medium" :class="labelColor(step.status)">
                {{ step.label }}
              </div>
              <!-- Model name -->
              <div v-if="step.model" class="text-xs text-gray-400 mt-0.5 truncate max-w-[7rem] text-center" :title="step.model">
                {{ step.model }}
              </div>
              <!-- Status badge -->
              <div class="mt-1">
                <span
                  v-if="step.status === 'running'"
                  class="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded"
                >进行中...</span>
                <span
                  v-else-if="step.status === 'done'"
                  class="text-xs text-green-600"
                >✓</span>
                <span
                  v-else-if="step.status === 'failed'"
                  class="text-xs text-red-600"
                >✗ 失败</span>
                <span
                  v-else-if="step.status === 'skipped'"
                  class="text-xs text-gray-400"
                >跳过</span>
              </div>
            </div>
          </div>

          <!-- Arrow connector -->
          <div
            v-if="idx < pipelineSteps.length - 1"
            class="flex items-center mt-6 w-6 flex-shrink-0"
          >
            <div class="w-full h-0.5 relative overflow-hidden" :class="arrowColor(step.status, pipelineSteps[idx + 1].status)">
              <!-- Animated flow for active transition -->
              <div
                v-if="step.status === 'done' && pipelineSteps[idx + 1].status === 'running'"
                class="absolute inset-0 bg-gradient-to-r from-green-400 to-blue-400 animate-pulse"
              ></div>
            </div>
            <svg class="w-2 h-2 flex-shrink-0 -ml-0.5" viewBox="0 0 6 10" fill="none">
              <path d="M1 1l4 4-4 4" :stroke="arrowStroke(step.status, pipelineSteps[idx + 1].status)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </template>
      </div>
    </div>

    <!-- Log tail -->
    <div v-if="logs.length > 0" class="mt-4 bg-gray-950 rounded-lg overflow-hidden">
      <div class="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <span class="text-xs text-gray-400 font-mono">运行日志</span>
        <span class="text-xs text-gray-500">{{ logs.length }} 条</span>
      </div>
      <div class="max-h-44 overflow-y-auto p-3 space-y-0.5 font-mono text-xs" ref="logContainer">
        <div
          v-for="log in logs"
          :key="log.id"
          class="flex gap-2"
          :class="logColor(log.level)"
        >
          <span class="text-gray-600 flex-shrink-0">{{ log.createdAt?.split('T')[1]?.slice(0, 8) }}</span>
          <span class="uppercase flex-shrink-0 w-8">{{ log.level }}</span>
          <span class="break-all">{{ log.message }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { TaskProgress, TaskProgressNode, PipelineStepName } from '../api/index.js'
import dayjs from 'dayjs'

const props = defineProps<{
  progress: TaskProgress | null
}>()

// Pipeline step definitions (always shown in this order)
const STEP_META: Record<string, { label: string; icon: string }> = {
  brain:      { label: '大脑决策', icon: '🧠' },
  researcher: { label: '信息研究', icon: '🔍' },
  writer:     { label: '内容创作', icon: '✍️' },
  reviewer:   { label: '审校优化', icon: '🔎' },
  prompter:   { label: '提示词', icon: '🎨' },
  illustrator:{ label: '图片生成', icon: '🖼️' },
  publishing: { label: '发布', icon: '📤' },
}

// Fixed pipeline order
const PIPELINE_ORDER: PipelineStepName[] = [
  'brain', 'researcher', 'writer', 'reviewer', 'prompter', 'illustrator', 'publishing',
]

type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

interface PipelineStep {
  id: string
  label: string
  icon: string
  status: StepStatus
  model: string
}

const logContainer = ref<HTMLElement | null>(null)

const task = computed(() => props.progress?.task)
const nodes = computed(() => props.progress?.nodes ?? [])
const logs = computed(() => props.progress?.logs ?? [])

const isRunning = computed(() => task.value?.status === 'running')
const isDone = computed(() => task.value?.status === 'done')
const isFailed = computed(() => task.value?.status === 'failed')

const currentStep = computed(() => task.value?.currentStep ?? '')

const duration = computed(() => {
  if (!task.value) return ''
  const start = dayjs(task.value.createdAt)
  const end = task.value.completedAt ? dayjs(task.value.completedAt) : dayjs()
  const ms = end.diff(start)
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
})

// Build the node map from workflow config
const nodeMap = computed(() => {
  const m = new Map<string, TaskProgressNode>()
  for (const n of nodes.value) {
    if (n.isEnabled) m.set(n.stepType, n)
  }
  return m
})

// Determine which steps are in this pipeline
const activeStepTypes = computed(() => {
  const types = new Set(nodes.value.filter((n) => n.isEnabled).map((n) => n.stepType))
  // publishing is always present conceptually
  types.add('publishing' as any)
  return types
})

// Compute step statuses based on currentStep and overall task status
function getStepStatus(stepId: string): StepStatus {
  const t = task.value
  if (!t) return 'pending'

  // If not in active steps, skip (unless it's publishing which is always there)
  if (stepId !== 'publishing' && !activeStepTypes.value.has(stepId as any)) {
    return 'skipped'
  }

  const current = currentStep.value
  const order = PIPELINE_ORDER
  const currentIdx = order.indexOf(current as PipelineStepName)
  const stepIdx = order.indexOf(stepId as PipelineStepName)

  if (t.status === 'done') {
    return 'done'
  }
  if (t.status === 'failed') {
    if (stepId === current) return 'failed'
    if (stepIdx < currentIdx) return 'done'
    return 'pending'
  }
  if (t.status === 'running') {
    if (stepId === current) return 'running'
    if (stepIdx < currentIdx) return 'done'
    return 'pending'
  }
  return 'pending'
}

const pipelineSteps = computed<PipelineStep[]>(() => {
  return PIPELINE_ORDER.map((id) => {
    const meta = STEP_META[id] ?? { label: id, icon: '⚙️' }
    const node = nodeMap.value.get(id)
    return {
      id,
      label: meta.label,
      icon: meta.icon,
      status: getStepStatus(id),
      model: node?.model ?? (id === 'publishing' ? 'Telegram' : ''),
    }
  })
})

function nodeClass(status: StepStatus): string {
  const base = 'border-2'
  switch (status) {
    case 'running':  return `${base} border-blue-400 bg-blue-50 shadow-lg shadow-blue-100 scale-110`
    case 'done':     return `${base} border-green-400 bg-green-50`
    case 'failed':   return `${base} border-red-400 bg-red-50`
    case 'skipped':  return `${base} border-gray-200 bg-gray-50`
    default:         return `${base} border-gray-200 bg-white`
  }
}

function labelColor(status: StepStatus): string {
  switch (status) {
    case 'running':  return 'text-blue-700'
    case 'done':     return 'text-green-700'
    case 'failed':   return 'text-red-700'
    case 'skipped':  return 'text-gray-400'
    default:         return 'text-gray-500'
  }
}

function arrowColor(leftStatus: StepStatus, rightStatus: StepStatus): string {
  if (leftStatus === 'done' && rightStatus === 'running') return 'bg-blue-300'
  if (leftStatus === 'done') return 'bg-green-300'
  if (leftStatus === 'failed') return 'bg-red-200'
  return 'bg-gray-200'
}

function arrowStroke(leftStatus: StepStatus, rightStatus: StepStatus): string {
  if (leftStatus === 'done' && rightStatus === 'running') return '#93c5fd'
  if (leftStatus === 'done') return '#86efac'
  if (leftStatus === 'failed') return '#fca5a5'
  return '#e5e7eb'
}

function logColor(level: string): string {
  switch (level) {
    case 'error': return 'text-red-400'
    case 'warn':  return 'text-yellow-400'
    default:      return 'text-green-300'
  }
}

// Auto-scroll logs to bottom when new entries arrive
watch(
  () => logs.value.length,
  async () => {
    await nextTick()
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight
    }
  },
)
</script>

<style scoped>
.workflow-progress {
  @apply select-none;
}
</style>
