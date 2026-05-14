import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const channels = sqliteTable('channels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tgChannelId: text('tg_channel_id').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').default(''),
  userIntro: text('user_intro').default(''),
  scheduleCron: text('schedule_cron').default('0 9 * * *'),
  scheduleOnce: text('schedule_once').default(''),   // ISO datetime, send once then clear
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

/**
 * Multi-provider AI key store. Each row is one user-configured provider instance.
 * providerType determines the SDK to use; baseUrl is optional for OpenAI-compatible endpoints.
 */
export const aiProviders = sqliteTable('ai_providers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  label: text('label').notNull(),
  providerType: text('provider_type', {
    enum: ['openai', 'anthropic', 'gemini', 'deepseek', 'openai_compatible'],
  }).notNull(),
  apiKey: text('api_key').notNull(),
  baseUrl: text('base_url').default(''),
  defaultModel: text('default_model').default(''),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

/**
 * Workflow node = one step in a channel's content pipeline.
 * stepType maps to a specific agent function in the pipeline.
 * Each node references one aiProviders row and specifies the model string.
 */
export const workflowNodes = sqliteTable('workflow_nodes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  channelId: integer('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  stepType: text('step_type', {
    enum: ['brain', 'researcher', 'writer', 'prompter', 'illustrator', 'reviewer'],
  }).notNull(),
  stepOrder: integer('step_order').notNull().default(0),
  providerId: integer('provider_id').references(() => aiProviders.id, { onDelete: 'set null' }),
  model: text('model').notNull().default(''),
  systemPrompt: text('system_prompt').default(''),
  temperature: real('temperature').default(0.8),
  maxTokens: integer('max_tokens').default(2048),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).default(true),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

export const pipelineConfigs = sqliteTable('pipeline_configs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  channelId: integer('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  searchEnabled: integer('search_enabled', { mode: 'boolean' }).default(true),
  searchQueryTemplate: text('search_query_template').default(''),
  imageEnabled: integer('image_enabled', { mode: 'boolean' }).default(true),
  customInstructions: text('custom_instructions').default(''),
  contentStyle: text('content_style').default('informative'),
  language: text('language').default('zh'),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  channelId: integer('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['pending', 'running', 'done', 'failed'] }).default('pending'),
  triggerType: text('trigger_type', { enum: ['auto', 'manual', 'preview'] }).default('manual'),
  currentStep: text('current_step').default(''),
  errorMessage: text('error_message'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  completedAt: text('completed_at'),
})

export const taskLogs = sqliteTable('task_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  level: text('level', { enum: ['info', 'warn', 'error'] }).default('info'),
  message: text('message').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

export const contentHistory = sqliteTable('content_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').references(() => tasks.id, { onDelete: 'set null' }),
  channelId: integer('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  textContent: text('text_content').notNull(),
  imageUrl: text('image_url'),
  imagePrompt: text('image_prompt'),
  searchKeywords: text('search_keywords'),
  searchResults: text('search_results'),
  tgMessageId: text('tg_message_id'),
  isPreview: integer('is_preview', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

export type Channel = typeof channels.$inferSelect
export type NewChannel = typeof channels.$inferInsert
export type AiProvider = typeof aiProviders.$inferSelect
export type NewAiProvider = typeof aiProviders.$inferInsert
export type WorkflowNode = typeof workflowNodes.$inferSelect
export type NewWorkflowNode = typeof workflowNodes.$inferInsert
export type PipelineConfig = typeof pipelineConfigs.$inferSelect
export type NewPipelineConfig = typeof pipelineConfigs.$inferInsert
export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert
export type TaskLog = typeof taskLogs.$inferSelect
export type ContentHistoryItem = typeof contentHistory.$inferSelect

export type StepType = 'brain' | 'researcher' | 'writer' | 'prompter' | 'illustrator' | 'reviewer'
export type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'openai_compatible'
