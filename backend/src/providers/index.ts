import { db } from '../db/index.js'
import { aiProviders } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { OpenAIProvider } from './openai.js'
import { AnthropicProvider } from './anthropic.js'
import { GeminiProvider } from './gemini.js'
import { OpenAICompatibleProvider } from './openai-compatible.js'
import type { AIProvider } from './types.js'

export type { AIProvider, GenerateTextOptions, GenerateImageOptions, ProviderType } from './types.js'

/** Cache keyed by `${providerId}:${model}` – cleared when a provider is updated */
const cache = new Map<string, AIProvider>()

export function clearProviderCache() {
  cache.clear()
}

export async function getProviderById(providerId: number, model: string): Promise<AIProvider> {
  const cacheKey = `${providerId}:${model}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)!

  const rows = await db.select().from(aiProviders).where(eq(aiProviders.id, providerId)).limit(1)
  const row = rows[0]
  if (!row) throw new Error(`AI provider id=${providerId} not found`)
  if (!row.isEnabled) throw new Error(`AI provider "${row.label}" is disabled`)
  if (!row.apiKey) throw new Error(`AI provider "${row.label}" has no API key`)

  const provider = buildProvider(row.providerType, row.apiKey, model, row.label, row.baseUrl ?? '')
  cache.set(cacheKey, provider)
  return provider
}

function buildProvider(
  providerType: string,
  apiKey: string,
  model: string,
  label: string,
  baseUrl: string,
): AIProvider {
  switch (providerType) {
    case 'openai':
      return new OpenAIProvider(apiKey, model, label, baseUrl || undefined)
    case 'anthropic':
      return new AnthropicProvider(apiKey, model, label, baseUrl || undefined)
    case 'gemini':
      return new GeminiProvider(apiKey, model, label)
    case 'deepseek':
      return new OpenAICompatibleProvider(apiKey, model, label, 'deepseek', baseUrl || undefined)
    case 'openai_compatible':
      return new OpenAICompatibleProvider(apiKey, model, label, 'openai_compatible', baseUrl || undefined)
    default:
      throw new Error(`Unknown provider type: ${providerType}`)
  }
}
