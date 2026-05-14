import OpenAI from 'openai'
import type { AIProvider, GenerateImageOptions, GenerateTextOptions } from './types.js'

// Prefix-based check: covers dall-e-*, gpt-image-*, gpt-image2, etc.
function isImageModel(model: string): boolean {
  const m = model.toLowerCase()
  return m.startsWith('dall-e') || m.startsWith('gpt-image') || m === 'dall-e-3' || m === 'dall-e-2'
}

export class OpenAIProvider implements AIProvider {
  name: string
  providerType = 'openai'
  supportsImages: boolean
  private client: OpenAI
  private model: string

  constructor(apiKey: string, model: string, label = 'OpenAI', baseUrl?: string) {
    this.client = new OpenAI({ apiKey, ...(baseUrl ? { baseURL: baseUrl } : {}) })
    this.model = model
    this.name = label
    this.supportsImages = isImageModel(model)
  }

  async generateText(userPrompt: string, options: GenerateTextOptions = {}): Promise<string> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []
    if (options.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt })
    messages.push({ role: 'user', content: userPrompt })

    const res = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: options.temperature ?? 0.8,
      max_tokens: options.maxTokens ?? 2048,
    })
    return res.choices[0]?.message?.content ?? ''
  }

  async generateImage(prompt: string, options: GenerateImageOptions = {}): Promise<string> {
    const m = this.model.toLowerCase()
    const isGptImage = m.startsWith('gpt-image')
    const isDallE = m.startsWith('dall-e')

    // gpt-image-* (gpt-image-1, gpt-image-2, etc.):
    //   - Only requires model + prompt; extra params cause API errors
    //   - Always returns b64_json automatically
    // dall-e-* supports size / quality / response_format
    const params: Record<string, unknown> = { model: this.model, prompt, n: 1 }
    if (isDallE) {
      params.size = options.size ?? '1024x1024'
      params.quality = options.quality ?? 'standard'
      params.response_format = 'url'
    } else if (isGptImage) {
      // Minimal call — let the API use its defaults
      if (options.size) params.size = options.size
    }

    const res = await this.client.images.generate(
      params as Parameters<typeof this.client.images.generate>[0],
    )

    // Normalize response — some proxies use non-standard shapes
    const raw = res as unknown as Record<string, unknown>
    const item = (Array.isArray(raw.data) ? raw.data[0] : raw) as Record<string, unknown> | undefined

    if (item) {
      const b64 = item.b64_json as string | undefined
      if (b64) return `data:image/png;base64,${b64}`
      const url = item.url as string | undefined
      if (url) return url
    }

    // Deep scan fallback for unexpected proxy response shapes
    const anyB64 = findDeep(raw, 'b64_json') as string | undefined
    if (anyB64) return `data:image/png;base64,${anyB64}`
    const anyUrl = findDeep(raw, 'url') as string | undefined
    if (anyUrl) return anyUrl

    throw new Error(`Image generation returned unexpected format: ${JSON.stringify(raw).slice(0, 300)}`)
  }

  async generatePrompt(topic: string, style: string, context?: string): Promise<string> {
    return this.generateText(buildPromptRequest(topic, style, context), {
      systemPrompt: PROMPT_SYSTEM,
      temperature: 0.9,
      maxTokens: 300,
    })
  }
}

const PROMPT_SYSTEM = `You are an expert at writing text-to-image prompts. Output ONLY the image prompt, nothing else.`

function buildPromptRequest(topic: string, style: string, context?: string): string {
  return `Create a detailed text-to-image prompt.\nTopic: ${topic}\nStyle: ${style}${context ? `\nContext: ${context}` : ''}\n\nOutput a single vivid paragraph in English.`
}

/** Recursively search for a key in a nested object/array */
function findDeep(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findDeep(item, key)
      if (found !== undefined) return found
    }
    return undefined
  }
  const record = obj as Record<string, unknown>
  if (key in record) return record[key]
  for (const v of Object.values(record)) {
    const found = findDeep(v, key)
    if (found !== undefined) return found
  }
  return undefined
}
