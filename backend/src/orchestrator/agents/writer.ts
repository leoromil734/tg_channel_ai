import type { AIProvider } from '../../providers/types.js'
import type { ResearchResult } from './researcher.js'

export interface WriterResult {
  content: string
  topic: string
}

export async function runWriter(
  channelName: string,
  channelDescription: string,
  userIntro: string,
  research: ResearchResult,
  contentStyle: string,
  language: string,
  customInstructions: string,
  textProvider: AIProvider,
): Promise<WriterResult> {
  const systemPrompt = `You are an expert social media content creator specializing in Telegram channel posts.
Your posts are engaging, well-structured, and perfectly tailored to the channel's audience.
Use appropriate emojis to enhance readability. Format text with Telegram markdown when appropriate.
${customInstructions ? `\nAdditional instructions: ${customInstructions}` : ''}`

  const userPrompt = `Create a high-quality Telegram post for the following channel:

**Channel**: ${channelName}
**Description**: ${channelDescription}  
**Operator notes**: ${userIntro}
**Content style**: ${contentStyle}
**Language**: ${language}

**Latest research & trends**:
${research.summary || research.formattedResults || 'No research data available, create original content.'}

**Requirements**:
- Write in ${language === 'zh' ? 'Chinese (Simplified)' : language}
- Style: ${contentStyle}
- Length: 150-400 words
- Include relevant hashtags at the end
- Make it informative, engaging, and shareable
- Do NOT include the channel name as a title header

Output ONLY the post content, no extra commentary.`

  const content = await textProvider.generateText(userPrompt, {
    systemPrompt,
    temperature: 0.85,
    maxTokens: 1000,
  })

  const topicPrompt = `In 5-8 words, what is the main topic of this post? Reply only with the topic phrase:

${content.slice(0, 300)}`

  const topic = await textProvider.generateText(topicPrompt, { temperature: 0.3, maxTokens: 50 })

  return {
    content: content.trim(),
    topic: topic.trim(),
  }
}
