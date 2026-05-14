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
  // Pass no size/quality — let the model/proxy use its own defaults.
  // Third-party gpt-image proxies often reject explicit size values with 400.
  const result = await imageProvider.generateImage(imagePrompt, {})

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
