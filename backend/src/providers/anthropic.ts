import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, GenerateImageOptions, GenerateTextOptions } from './types.js'

export class AnthropicProvider implements AIProvider {
  name: string
  providerType = 'anthropic'
  supportsImages = false
  private client: Anthropic
  private model: string

  constructor(apiKey: string, model: string, label = 'Claude', baseUrl?: string) {
    this.client = new Anthropic({ apiKey, ...(baseUrl ? { baseURL: baseUrl } : {}) })
    this.model = model
    this.name = label
  }

  async generateText(userPrompt: string, options: GenerateTextOptions = {}): Promise<string> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
      messages: [{ role: 'user', content: userPrompt }],
    })
    const block = res.content[0]
    if (block.type !== 'text') throw new Error('Anthropic returned non-text block')
    return block.text
  }

  async generateImage(_prompt: string, _options?: GenerateImageOptions): Promise<string> {
    throw new Error('Anthropic Claude does not support image generation.')
  }

  async generatePrompt(topic: string, style: string, context?: string): Promise<string> {
    return this.generateText(
      `Create a detailed text-to-image prompt.\nTopic: ${topic}\nStyle: ${style}${context ? `\nContext: ${context}` : ''}\n\nOutput a single vivid paragraph in English.`,
      { systemPrompt: 'You are an expert at writing text-to-image prompts. Output ONLY the prompt.', temperature: 0.9, maxTokens: 300 },
    )
  }
}
