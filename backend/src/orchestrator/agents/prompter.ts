import type { AIProvider } from '../../providers/types.js'
import type { CreativeBrief } from './brain.js'

export interface PrompterResult {
  imagePrompt: string
  style: string
}

const STYLE_GUIDES: Record<string, string> = {
  informative: 'clean infographic style, professional, modern design',
  creative: 'artistic, vibrant colors, creative illustration',
  news: 'photorealistic, journalistic photography style',
  tech: 'futuristic, digital art, neon lights, cyberpunk aesthetic',
  lifestyle: 'warm tones, lifestyle photography, natural light',
  business: 'corporate, clean, minimalist, professional',
  entertainment: 'dynamic, colorful, eye-catching, cinematic',
}

export async function runPrompter(
  topic: string,
  channelName: string,
  channelDescription: string,
  contentStyle: string,
  promptProvider: AIProvider,
  creativeBrief?: CreativeBrief,
): Promise<PrompterResult> {
  const style = STYLE_GUIDES[contentStyle] ?? 'high quality, detailed, professional'

  // Use brain's image concept hint when available
  const conceptHint = creativeBrief?.imageConceptHint || `${topic} for ${channelName}`
  const context = creativeBrief
    ? `频道「${channelName}」今天的内容是关于：${creativeBrief.topic}。图片概念：${conceptHint}`
    : `This image accompanies a post about: ${topic} for channel ${channelName} - ${channelDescription}`

  console.log(`[Prompter] Generating prompt for: "${conceptHint}", style: "${style}"`)
  const imagePrompt = await promptProvider.generatePrompt(conceptHint, style, context)
  console.log(`[Prompter] Generated prompt (${imagePrompt.length} chars): "${imagePrompt}"`)

  if (!imagePrompt || imagePrompt.trim().length === 0) {
    throw new Error('Prompter returned empty image prompt')
  }

  return {
    imagePrompt: imagePrompt.trim(),
    style,
  }
}
