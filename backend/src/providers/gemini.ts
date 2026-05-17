import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai'
import type { AIProvider, GenerateImageOptions, GenerateTextOptions } from './types.js'

const IMAGE_MODELS = new Set([
  'gemini-2.0-flash-preview-image-generation',
  'imagen-3.0-generate-002',
  'imagen-3.0-fast-generate-001',
])

export class GeminiProvider implements AIProvider {
  name: string
  providerType = 'gemini'
  supportsImages: boolean
  private genAI: GoogleGenerativeAI
  private model: string

  constructor(apiKey: string, model: string, label = 'Gemini') {
    this.genAI = new GoogleGenerativeAI(apiKey)
    this.model = model
    this.name = label
    this.supportsImages = IMAGE_MODELS.has(model)
  }

  async generateText(userPrompt: string, options: GenerateTextOptions = {}): Promise<string> {
    const genModel = this.genAI.getGenerativeModel({
      model: this.model,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      ],
    })

    const prompt = options.systemPrompt
      ? `[System]\n${options.systemPrompt}\n\n[User]\n${userPrompt}`
      : userPrompt

    const result = await genModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: options.temperature ?? 0.8,
      },
    })
    return result.response.text()
  }

  async generateImage(prompt: string, _options: GenerateImageOptions = {}): Promise<string> {
    const genModel = this.genAI.getGenerativeModel({ model: this.model })
    const result = await genModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } as Record<string, unknown>,
    })

    const parts = result.response.candidates?.[0]?.content?.parts ?? []
    for (const part of parts) {
      if ('inlineData' in part && part.inlineData) {
        const { mimeType, data } = part.inlineData as { mimeType: string; data: string }
        return `data:${mimeType};base64,${data}`
      }
    }
    throw new Error('Gemini returned no image data')
  }

  async generatePrompt(topic: string, style: string, context?: string): Promise<string> {
    return this.generateText(
      `Create a detailed text-to-image prompt.\nTopic: ${topic}\nStyle: ${style}${context ? `\nContext: ${context}` : ''}\n\nOutput a single vivid paragraph in English.`,
      { systemPrompt: 'You are an expert at writing text-to-image prompts. Output ONLY the prompt.', temperature: 0.9, maxTokens: 300 },
    )
  }
}
