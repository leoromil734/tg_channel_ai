import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { AIProvider } from '../../providers/types.js'

export interface IllustratorResult {
  imageUrl: string
  isBase64: boolean
  localPath?: string
}

export async function runIllustrator(
  imagePrompt: string,
  imageProvider: AIProvider,
): Promise<IllustratorResult> {
  // Truncate prompt: many third-party proxies reject long prompts with 400.
  // Keep it under 600 chars for maximum compatibility.
  const safePrompt = imagePrompt.length > 600 ? imagePrompt.slice(0, 597) + '...' : imagePrompt

  const result = await imageProvider.generateImage(safePrompt, {})

  if (result.startsWith('data:')) {
    const base64Data = result.split(',')[1]
    const ext = result.includes('image/png') ? 'png' : 'jpg'
    const filename = `img_${Date.now()}.${ext}`
    const dir = './data/images'
    mkdirSync(dir, { recursive: true })
    const localPath = join(dir, filename)
    writeFileSync(localPath, Buffer.from(base64Data, 'base64'))

    return {
      imageUrl: result,
      isBase64: true,
      localPath,
    }
  }

  return {
    imageUrl: result,
    isBase64: false,
  }
}
