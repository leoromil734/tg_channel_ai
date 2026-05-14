import OpenAI from 'openai'
import type { AIProvider, GenerateImageOptions, GenerateTextOptions } from './types.js'

/**
 * Covers DeepSeek, Moonshot, Qwen, Mistral, and any OpenAI-compatible REST API.
 * DeepSeek base URL: https://api.deepseek.com
 */
const DEFAULT_BASE_URLS: Record<string, string> = {
  deepseek: 'https://api.deepseek.com',
}

export class OpenAICompatibleProvider implements AIProvider {
  name: string
  providerType: string
  supportsImages = false
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

  async generateImage(_prompt: string, _options?: GenerateImageOptions): Promise<string> {
    throw new Error(`${this.name} does not support image generation.`)
  }

  async generatePrompt(topic: string, style: string, context?: string): Promise<string> {
    return this.generateText(
      `Create a detailed text-to-image prompt.\nTopic: ${topic}\nStyle: ${style}${context ? `\nContext: ${context}` : ''}\n\nOutput a single vivid paragraph in English.`,
      { systemPrompt: 'You are an expert at writing text-to-image prompts. Output ONLY the prompt.', temperature: 0.9, maxTokens: 300 },
    )
  }
}
