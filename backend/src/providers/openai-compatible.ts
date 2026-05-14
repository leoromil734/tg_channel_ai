import OpenAI from 'openai'
import type { AIProvider, GenerateImageOptions, GenerateTextOptions } from './types.js'

/**
 * Covers DeepSeek, Moonshot, Qwen, Mistral, and any OpenAI-compatible REST API.
 * DeepSeek base URL: https://api.deepseek.com
 */
const DEFAULT_BASE_URLS: Record<string, string> = {
  deepseek: 'https://api.deepseek.com',
}

function compatibleIsImageModel(model: string): boolean {
  const m = model.toLowerCase()
  return (
    m.startsWith('dall-e') ||
    m.startsWith('gpt-image') ||
    m.includes('image-gen') ||
    m.includes('image-generation') ||
    m.includes('image2') ||
    m.includes('flux') ||
    m.includes('stable-diffusion') ||
    m.includes('sdxl')
  )
}

export class OpenAICompatibleProvider implements AIProvider {
  name: string
  providerType: string
  supportsImages: boolean
  private client: OpenAI
  private model: string

  constructor(
    apiKey: string,
    model: string,
    label: string,
    providerType: string,
    baseUrl?: string,
  ) {
    const resolvedBase = baseUrl || DEFAULT_BASE_URLS[providerType] || ''
    if (!resolvedBase) {
      throw new Error(`Provider "${providerType}" requires a base URL`)
    }
    this.client = new OpenAI({ apiKey, baseURL: resolvedBase })
    this.model = model
    this.name = label
    this.providerType = providerType
    this.supportsImages = compatibleIsImageModel(model)
  }

  async generateText(userPrompt: string, options: GenerateTextOptions = {}): Promise<string> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []
    if (options.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt })
    messages.push({ role: 'user', content: userPrompt })

    // DeepSeek reasoning models (r1, v3, v4-pro, etc.) support the `thinking` parameter.
    // We always pass it for deepseek providerType so reasoning tokens are generated
    // separately from the final content (content field will be non-empty).
    const extraParams: Record<string, unknown> = {}
    if (this.providerType === 'deepseek') {
      extraParams.thinking = { type: 'enabled' }
    }

    const res = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: options.temperature ?? 0.8,
      max_tokens: options.maxTokens ?? 2048,
      ...extraParams,
    } as Parameters<typeof this.client.chat.completions.create>[0])

    // For reasoning models the answer lives in `content`;
    // `reasoning_content` holds the chain-of-thought (we ignore it here).
    const choice = res.choices[0]
    return choice?.message?.content ?? ''
  }

  async generateImage(prompt: string, _options?: GenerateImageOptions): Promise<string> {
    if (!this.supportsImages) {
      throw new Error(`${this.name} (model: ${this.model}) does not support image generation.`)
    }

    // Try standard images API first
    try {
      const res = await this.client.images.generate({
        model: this.model,
        prompt,
        n: 1,
      } as Parameters<typeof this.client.images.generate>[0])

      const raw = res as unknown as Record<string, unknown>

      // Standard: { data: [{ b64_json | url }] }
      if (Array.isArray(raw.data) && raw.data.length > 0) {
        const item = raw.data[0] as Record<string, unknown>
        if (item.b64_json) return `data:image/png;base64,${item.b64_json}`
        if (item.url) return item.url as string
      }

      // Proxy returns chat completion format: { choices: [{ message: { content: "![...](url)" } }] }
      if (Array.isArray(raw.choices) && raw.choices.length > 0) {
        const msg = ((raw.choices[0] as Record<string, unknown>).message ?? {}) as Record<string, unknown>
        const text = (msg.content ?? '') as string
        const mdMatch = text.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/)
        if (mdMatch) return mdMatch[1]
        const urlMatch = text.match(/https?:\/\/[^\s"')]+/)
        if (urlMatch) return urlMatch[0]
        if (text.startsWith('data:image')) return text
      }
    } catch (err) {
      // If images API fails, fall through to chat completions attempt
      const msg = (err as Error).message
      if (!msg.includes('400') && !msg.includes('404') && !msg.includes('not found')) throw err
    }

    // Fallback: some proxies route image generation through chat completions
    const chatRes = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
    } as Parameters<typeof this.client.chat.completions.create>[0])

    const content = chatRes.choices[0]?.message?.content ?? ''
    const mdMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/)
    if (mdMatch) return mdMatch[1]
    const urlMatch = content.match(/https?:\/\/[^\s"')]+/)
    if (urlMatch) return urlMatch[0]
    if (content.startsWith('data:image')) return content

    throw new Error(`Image generation returned no usable content: ${content.slice(0, 200)}`)
  }

  async generatePrompt(topic: string, style: string, context?: string): Promise<string> {
    return this.generateText(
      `Create a concise text-to-image prompt (max 2 sentences).\nTopic: ${topic}\nStyle: ${style}${context ? `\nContext: ${context}` : ''}\n\nOutput ONLY the prompt, no explanation.`,
      { systemPrompt: 'You are an expert at writing short, vivid text-to-image prompts. Output ONLY the prompt in English.', temperature: 0.9, maxTokens: 120 },
    )
  }
}
