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
    // gpt-image-1 / gpt-image2 use base64 output; dall-e series use URL
    const useBase64 = m.startsWith('gpt-image')

    const res = await this.client.images.generate({
      model: this.model,
      prompt,
      n: 1,
      size: options.size ?? '1024x1024',
      quality: (options.quality ?? 'standard') as 'standard' | 'hd' | 'low' | 'medium' | 'high' | 'auto',
      ...(useBase64 ? { response_format: 'b64_json' } : { response_format: 'url' }),
    })

    if (useBase64) {
      const b64 = res.data[0]?.b64_json
      if (!b64) throw new Error('Image generation returned no base64 data')
      return `data:image/png;base64,${b64}`
    }
    const url = res.data[0]?.url
    if (!url) throw new Error('Image generation returned no URL')
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
