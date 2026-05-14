import OpenAI from 'openai'
import type { AIProvider, GenerateImageOptions, GenerateTextOptions } from './types.js'

const IMAGE_MODELS = new Set(['dall-e-3', 'dall-e-2', 'gpt-image-1'])

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
    this.supportsImages = IMAGE_MODELS.has(model)
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
    const res = await this.client.images.generate({
      model: this.model,
      prompt,
      n: 1,
      size: options.size ?? '1024x1024',
      quality: options.quality ?? 'standard',
      response_format: 'url',
    })
    const url = res.data[0]?.url
    if (!url) throw new Error('OpenAI image generation returned no URL')
    return url
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
