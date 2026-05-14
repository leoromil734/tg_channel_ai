import OpenAI from 'openai'
import type { AIProvider, GenerateImageOptions, GenerateTextOptions } from './types.js'

// Prefix-based check: covers dall-e-*, gpt-image-*, firefly-gpt-image-*, etc.
function isImageModel(model: string): boolean {
  const m = model.toLowerCase()
  return (
    m.startsWith('dall-e') ||
    m.startsWith('gpt-image') ||
    m.includes('gpt-image') ||   // handles firefly-gpt-image-2-1k-1 style names
    m.includes('image-gen') ||
    m.includes('image-generation')
  )
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
    if (options.[REDACTED]) messages.push({ role: 'system', content: options.[REDACTED] })
    messages.push({ role: 'user', content: userPrompt })

    console.log(`[OpenAIProvider] generateText with model: ${this.model}`)
    console.log(`[OpenAIProvider] Request:`, JSON.stringify({ messages, temperature: options.temperature, max_tokens: options.maxTokens }, null, 2))

    try {
      const res = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.8,
        max_tokens: options.maxTokens ?? 2048,
      })

      console.log(`[OpenAIProvider] Response:`, JSON.stringify(res, null, 2))
      const content = res.choices[0]?.message?.content ?? ''
      
      if (!content || content.trim().length === 0) {
        console.error(`[OpenAIProvider] API returned empty content. Full response:`, JSON.stringify(res, null, 2))
        throw new Error(`OpenAI API returned empty content for model ${this.model}`)
      }

      return content
    } catch (error) {
      console.error(`[OpenAIProvider] generateText failed:`, error)
      throw error
    }
  }

  async generateImage(prompt: string, options: GenerateImageOptions = {}): Promise<string> {
    const m = this.model.toLowerCase()
    const isDallE = m.startsWith('dall-e')

    // For DALL-E: pass size / quality / response_format / n
    // For everything else (gpt-image-*, firefly-gpt-image-*, custom proxies):
    //   send ONLY model + prompt — any extra param risks a 400 from the proxy
    let params: Record<string, unknown>
    if (isDallE) {
      params = {
        model: this.model,
        prompt,
        n: 1,
        size: options.size ?? '1024x1024',
        quality: options.quality ?? 'standard',
        response_format: 'url',
      }
    } else {
      params = { model: this.model, prompt }
    }

    // Try /images/generations first; fall back to /chat/completions for proxies
    // that route image generation through the chat API
    let raw: Record<string, unknown> | null = null

    try {
      const res = await this.client.images.generate(
        params as Parameters<typeof this.client.images.generate>[0],
      )
      raw = res as unknown as Record<string, unknown>
    } catch (_err) {
      // Proxy doesn't support /images/generations — try chat completions fallback
      console.warn(`[OpenAIProvider] images.generate failed, trying chat completions fallback`)
    }

    // If images API failed or returned empty data, fall back to chat completions
    if (!raw || (!Array.isArray(raw.data) && !Array.isArray(raw.choices))) {
      const chatRes = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
      } as Parameters<typeof this.client.chat.completions.create>[0])

      const text = chatRes.choices[0]?.message?.content ?? ''
      const mdMatch = text.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/)
      if (mdMatch) return mdMatch[1]
      const urlMatch = text.match(/https?:\/\/[^\s"')]+/)
      if (urlMatch) return urlMatch[0]
      if (text.startsWith('data:image')) return text
      if (text.length > 100) return `data:image/png;base64,${text}` // raw base64
      throw new Error(`Image generation via chat fallback returned no image: "${text.slice(0, 200)}"`)
    }

    // Parse standard images API response
    // Case 1: { data: [{ b64_json | url }] }
    if (Array.isArray(raw.data) && raw.data.length > 0) {
      const item = raw.data[0] as Record<string, unknown>
      if (item.b64_json) return `data:image/png;base64,${item.b64_json}`
      if (item.url) return item.url as string
    }

    // Case 2: Chat completion format in images response
    if (Array.isArray(raw.choices) && raw.choices.length > 0) {
      const msg = ((raw.choices[0] as Record<string, unknown>).message ?? {}) as Record<string, unknown>
      const text = (msg.content ?? '') as string
      const mdMatch = text.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/)
      if (mdMatch) return mdMatch[1]
      const urlMatch = text.match(/https?:\/\/[^\s"')]+/)
      if (urlMatch) return urlMatch[0]
      if (text.startsWith('data:image')) return text
    }

    // Case 3: Deep scan
    const anyB64 = findDeep(raw, 'b64_json') as string | undefined
    if (anyB64) return `data:image/png;base64,${anyB64}`
    const anyUrl = findDeep(raw, 'url') as string | undefined
    if (anyUrl) return anyUrl as string

    throw new Error(`Image generation returned unexpected format: ${JSON.stringify(raw).slice(0, 300)}`)
  }

  async generatePrompt(topic: string, style: string, context?: string): Promise<string> {
    return this.generateText(buildPromptRequest(topic, style, context), {
      [REDACTED]: PROMPT_SYSTEM,
      temperature: 0.9,
      maxTokens: 120,   // Keep prompts short — many image proxies reject long prompts with 400
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