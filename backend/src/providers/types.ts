export interface GenerateTextOptions {
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
}

export interface GenerateImageOptions {
  size?: '1024x1024' | '1792x1024' | '1024x1792'
  quality?: 'standard' | 'hd'
  style?: 'vivid' | 'natural'
}

export interface AIProvider {
  name: string
  providerType: string
  supportsImages: boolean
  generateText(userPrompt: string, options?: GenerateTextOptions): Promise<string>
  generateImage(prompt: string, options?: GenerateImageOptions): Promise<string>
  generatePrompt(topic: string, style: string, context?: string): Promise<string>
}

export type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'openai_compatible'
