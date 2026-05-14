import { getToolDescriptionText, executeTools, type ToolCall, type ToolResult } from '../../tools/registry.js'
import type { AIProvider } from '../../providers/types.js'

export interface BrainResult {
  toolCalls: ToolCall[]
  toolResults: ToolResult[]
  researchSummary: string
  selectedTopics: string[]
}

const MAX_TOOL_CALLS = 4

/**
 * Brain agent — ReAct-style tool orchestration.
 *
 * Works with ANY LLM provider (no native function-calling required).
 * The brain model outputs structured JSON with chosen tool calls,
 * tools are executed, and results are synthesized into a research summary.
 */
export async function runBrain(
  channelName: string,
  channelDescription: string,
  userIntro: string,
  contentStyle: string,
  language: string,
  brainProvider: AIProvider,
  customSystemPrompt?: string,
): Promise<BrainResult> {
  const toolDocs = getToolDescriptionText()

  const systemPrompt = customSystemPrompt || `You are the strategic brain of an AI content team managing a Telegram channel.
Your job is to decide which research tools to use to gather the best information for today's post.
Be smart, targeted, and efficient — choose at most ${MAX_TOOL_CALLS} tools.
Always reason about what information would make the most impactful and engaging content.`

  const planPrompt = `You are managing a Telegram channel with the following profile:

**Channel Name**: ${channelName}
**Description**: ${channelDescription}
**Operator Notes**: ${userIntro || 'None'}
**Content Style**: ${contentStyle}
**Language**: ${language}

## Available Research Tools
${toolDocs}

## Your Task
Decide which tools to call to gather the best information for today's post.
Consider: trending topics, recent news, background knowledge, and specific sources.

Respond ONLY with a valid JSON object in this exact format:
{
  "reasoning": "brief explanation of your strategy",
  "selectedTopics": ["topic1", "topic2"],
  "toolCalls": [
    {"tool": "search", "args": {"query": "..."}, "reason": "..."},
    {"tool": "trending", "args": {"geo": "CN"}, "reason": "..."}
  ]
}

Rules:
- Max ${MAX_TOOL_CALLS} tool calls
- At least 1 tool call (usually "search" or "news")
- toolCalls must be a valid array
- Match tool names and args exactly to the definitions above`

  // Step 1: Ask the brain to plan tool calls
  const planRaw = await brainProvider.generateText(planPrompt, {
    systemPrompt,
    temperature: 0.4,
    maxTokens: 800,
  })

  let toolCalls: ToolCall[] = []
  let reasoning = ''
  let selectedTopics: string[] = []

  try {
    const jsonMatch = planRaw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        reasoning?: string
        selectedTopics?: string[]
        toolCalls?: ToolCall[]
      }
      toolCalls = (parsed.toolCalls ?? []).slice(0, MAX_TOOL_CALLS)
      reasoning = parsed.reasoning ?? ''
      selectedTopics = parsed.selectedTopics ?? []
    }
  } catch {
    // Fallback: run a basic search
    toolCalls = [{ tool: 'search', args: { query: `${channelName} ${channelDescription.slice(0, 40)} 最新` } }]
  }

  if (toolCalls.length === 0) {
    toolCalls = [{ tool: 'search', args: { query: `${channelName} latest news` } }]
  }

  // Step 2: Execute all tool calls in parallel
  const toolResults = await executeTools(toolCalls)

  // Step 3: Synthesize results into a research summary
  const successResults = toolResults.filter((r) => !r.error && r.output)
  const failedTools = toolResults.filter((r) => r.error)

  if (successResults.length === 0) {
    return {
      toolCalls,
      toolResults,
      researchSummary: `No research data available. Create original content about: ${channelDescription}`,
      selectedTopics,
    }
  }

  const rawData = successResults
    .map((r) => `[${r.tool.toUpperCase()}]\n${r.output}`)
    .join('\n\n═══\n\n')

  const synthesisPrompt = `Based on the following research data collected for the Telegram channel "${channelName}", 
write a comprehensive research summary in ${language === 'zh' ? 'Chinese' : language}.

Channel context: ${channelDescription}
${userIntro ? `Operator notes: ${userIntro}` : ''}

Research Data:
${rawData.slice(0, 6000)}

${failedTools.length > 0 ? `Note: ${failedTools.map((t) => t.tool).join(', ')} tools failed.` : ''}

Synthesize the most relevant and interesting findings into:
1. Key insights and facts (3-5 points)
2. Trending angles worth covering
3. Suggested content focus for today's post

Write in flowing prose, ${language === 'zh' ? '用中文' : `in ${language}`}. Max 400 words.`

  const researchSummary = await brainProvider.generateText(synthesisPrompt, {
    systemPrompt: 'You are a research synthesizer. Extract key insights from raw data. Be concise and focused.',
    temperature: 0.5,
    maxTokens: 600,
  })

  return {
    toolCalls,
    toolResults,
    researchSummary: researchSummary.trim(),
    selectedTopics,
  }
}
