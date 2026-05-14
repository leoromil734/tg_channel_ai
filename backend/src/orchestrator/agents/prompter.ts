import type { AIProvider } from '../../providers/types.js'

export interface PrompterResult {
  imagePrompt: string
  style: string
}

export async function runPrompter(
  topic: string,
  channelName: string,
  channelDescription: string,
  contentStyle: string,
  promptProvider: AIProvider,
): Promise<PrompterResult> {
  const styleMap: Record<string, string> = {
    informative: 'clean infographic style, professional, modern design',
    creative: 'artistic, vibrant colors, creative illustration',
    news: 'photorealistic, journalistic photography style',
    tech: 'futuristic, digital art, neon lights, cyberpunk aesthetic',
    lifestyle: 'warm tones, lifestyle photography, natural light',
    business: 'corporate, clean, minimalist, professional',
    entertainment: 'dynamic, colorful, eye-catching, cinematic',
  }

  const style = styleMap[contentStyle] ?? 'high quality, detailed, professional'

  const imagePrompt = await promptProvider.generatePrompt(
    `${topic} for ${channelName} - ${channelDescription}`,
    style,
    `This image will accompany a social media post about: ${topic}`,
  )

  return {
    imagePrompt: imagePrompt.trim(),
    style,
  }
}
