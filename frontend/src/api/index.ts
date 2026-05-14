import axios from 'axios'

const api = axios.create({
  baseURL: '/res',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const secret = localStorage.getItem('api_secret')
  if (secret) config.headers.Authorization = `Bearer ${secret}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('api_secret')
      window.location.hash = '#/login'
    }
    return Promise.reject(err)
  },
)

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Channel {
  id: number
  tgChannelId: string
  name: string
  description: string
  userIntro: string
  scheduleCron: string
  scheduleOnce: string   // ISO datetime string, empty = disabled
  isActive: boolean
  createdAt: string
  updatedAt: string
  config?: PipelineConfig
}

export interface PipelineConfig {
  id: number
  channelId: number
  searchEnabled: boolean
  searchQueryTemplate: string
  imageEnabled: boolean
  customInstructions: string
  contentStyle: string
  language: string
}

export type PipelineStepName =
  | 'brain' | 'researcher' | 'writer' | 'reviewer' | 'prompter' | 'illustrator' | 'publishing' | 'done' | 'failed'

export interface Task {
  id: number
  channelId: number
  channelName?: string
  status: 'pending' | 'running' | 'done' | 'failed'
  triggerType: 'auto' | 'manual' | 'preview'
  currentStep?: PipelineStepName | string
  errorMessage?: string
  createdAt: string
  completedAt?: string
}

export interface TaskProgressNode {
  stepType: StepType
  stepOrder: number
  model: string
  isEnabled: boolean
}

export interface TaskProgress {
  task: Task
  nodes: TaskProgressNode[]
  logs: TaskLog[]
}

export interface TaskLog {
  id: number
  taskId: number
  level: 'info' | 'warn' | 'error'
  message: string
  createdAt: string
}

export interface ContentItem {
  id: number
  taskId?: number
  channelId: number
  channelName?: string
  textContent: string
  imageUrl?: string
  imagePrompt?: string
  searchKeywords?: string
  tgMessageId?: string
  isPreview: boolean
  createdAt: string
}

export type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'openai_compatible'

export interface AiProvider {
  id: number
  label: string
  providerType: ProviderType
  baseUrl: string
  defaultModel: string
  isEnabled: boolean
  createdAt: string
  updatedAt: string
}

export type StepType = 'brain' | 'researcher' | 'writer' | 'prompter' | 'illustrator' | 'reviewer'

export interface WorkflowNode {
  id?: number
  channelId?: number
  stepType: StepType
  stepOrder: number
  providerId: number | null
  model: string
  systemPrompt: string
  temperature: number
  maxTokens: number
  isEnabled: boolean
}

export interface TaskStats {
  total: number
  done: number
  failed: number
  running: number
  pending: number
}

// ─── API clients ──────────────────────────────────────────────────────────────

export const channelsApi = {
  list: () => api.get<Channel[]>('/channels'),
  listPending: () => api.get<Channel[]>('/channels/pending'),
  sync: (tgChannelId: string) =>
    api.post<{ success?: boolean; already_exists?: boolean; channel: Channel }>('/channels/sync', { tgChannelId }),
  activate: (id: number, data?: Partial<Channel>) => api.post<Channel>(`/channels/${id}/activate`, data ?? {}),
  get: (id: number) => api.get<Channel>(`/channels/${id}`),
  create: (data: Partial<Channel>) => api.post<Channel>('/channels', data),
  update: (id: number, data: Partial<Channel>) => api.put<Channel>(`/channels/${id}`, data),
  delete: (id: number) => api.delete(`/channels/${id}`),
  getConfig: (id: number) => api.get<PipelineConfig>(`/channels/${id}/config`),
  updateConfig: (id: number, data: Partial<PipelineConfig>) =>
    api.put<PipelineConfig>(`/channels/${id}/config`, data),
}

export const tasksApi = {
  list: (params?: { channelId?: number; status?: string; date?: string }) =>
    api.get<Task[]>('/tasks', { params }),
  get: (id: number) => api.get<Task>(`/tasks/${id}`),
  getLogs: (id: number) => api.get<TaskLog[]>(`/tasks/${id}/logs`),
  getProgress: (id: number) => api.get<TaskProgress>(`/tasks/${id}/progress`),
  stats: () => api.get<TaskStats>('/tasks/stats/today'),
}

export const contentApi = {
  list: (params?: { channelId?: number; dateFrom?: string; dateTo?: string; limit?: number; offset?: number }) =>
    api.get<ContentItem[]>('/content', { params }),
  get: (id: number) => api.get<ContentItem>(`/content/${id}`),
  delete: (id: number) => api.delete(`/content/${id}`),
}

export interface ProviderTestResult {
  ok: boolean
  latency: number
  model: string
  providerType: string
  label: string
  response?: string
  error?: string
}

export const providersApi = {
  list: () => api.get<AiProvider[]>('/providers'),
  create: (data: { label: string; providerType: ProviderType; apiKey: string; baseUrl?: string; defaultModel?: string; isEnabled?: boolean }) =>
    api.post<AiProvider>('/providers', data),
  update: (id: number, data: Partial<AiProvider & { apiKey?: string }>) =>
    api.put<AiProvider>(`/providers/${id}`, data),
  delete: (id: number) => api.delete(`/providers/${id}`),
  test: (id: number) => api.post<ProviderTestResult>(`/providers/${id}/test`),
}

export const workflowApi = {
  getNodes: (channelId: number) => api.get<WorkflowNode[]>(`/workflow/${channelId}`),
  saveNodes: (channelId: number, nodes: Omit<WorkflowNode, 'id' | 'channelId'>[]) =>
    api.post<WorkflowNode[]>(`/workflow/${channelId}`, nodes),
  updateNode: (id: number, data: Partial<WorkflowNode>) =>
    api.put<WorkflowNode>(`/workflow/node/${id}`, data),
  deleteNode: (id: number) => api.delete(`/workflow/node/${id}`),
}

export const pipelineApi = {
  run: (channelId: number, preview = false) =>
    api.post(`/pipeline/run/${channelId}`, { preview }),
}

export default api
