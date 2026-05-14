import type { AIProvider } from '../../providers/types.js'

export interface ReviewerResult {
  finalContent: string
  suggestions: string
  approved: boolean
}

export async function runReviewer(
  content: string,
  channelName: string,
  channelDescription: string,
  userIntro: string,
  reviewProvider: AIProvider,
): Promise<ReviewerResult> {
  const systemPrompt = `You are a professional content editor and quality reviewer for Telegram channels.
Your job is to review and improve content before it gets published.
Be concise, constructive, and output improved content directly.`

  const userPrompt = `Review and improve the following Telegram post for channel "${channelName}".

Channel description: ${channelDescription}
Operator notes: ${userIntro || 'None'}

--- DRAFT CONTENT ---
${content}
--- END DRAFT ---

Tasks:
1. Check for factual issues, awkward phrasing, or inappropriate content
2. Improve clarity, engagement, and tone to match channel style
3. Ensure hashtags are relevant

Respond in this exact JSON format:
{
  "approved": true,
  "suggestions": "brief note on what was changed",
  "finalContent": "the improved post content here"
}`

  const raw = await reviewProvider.generateText(userPrompt, {
    systemPrompt,
    temperature: 0.4,
    maxTokens: 1500,
  })

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        approved: boolean
        suggestions: string
        finalContent: string
      }
      return {
        finalContent: parsed.finalContent?.trim() || content,
        suggestions: parsed.suggestions || '',
        approved: parsed.approved !== false,
      }
    }
  } catch {
    // JSON parse failed – return original content with a note
  }

  return {
    finalContent: content,
    suggestions: 'Reviewer output could not be parsed, using original content.',
    approved: true,
  }
}
