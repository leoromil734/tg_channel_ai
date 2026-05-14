import { db } from '../db/index.js'
import { channels, pipelineConfigs, workflowNodes, tasks, taskLogs, contentHistory } from '../db/schema.js'
import { eq, asc } from 'drizzle-orm'
import { getProviderById } from '../providers/index.js'
import { runBrain } from './agents/brain.js'
import { runResearcher } from './agents/researcher.js'
import { runWriter } from './agents/writer.js'
import { runPrompter } from './agents/prompter.js'
import { runIllustrator } from './agents/illustrator.js'
import { runReviewer } from './agents/reviewer.js'
import type { AIProvider } from '../providers/types.js'
import type { Bot } from 'grammy'

export interface PipelineResult {
  textContent: string
  imageUrl?: string
  imagePrompt?: string
  searchKeywords?: string
  tgMessageId?: string
  reviewSuggestions?: string
  toolsUsed?: string[]
}

type StepType = 'brain' | 'researcher' | 'writer' | 'prompter' | 'illustrator' | 'reviewer'

interface LoadedNode {
  stepType: StepType
  provider: AIProvider
  systemPrompt: string
  temperature: number
  maxTokens: number
}

async function addLog(taskId: number, level: 'info' | 'warn' | 'error', message: string) {
  await db.insert(taskLogs).values({ taskId, level, message })
  console.log(`[Task ${taskId}] [${level.toUpperCase()}] ${message}`)
}

async function loadWorkflowNodes(channelId: number): Promise<Map<StepType, LoadedNode>> {
  const nodes = await db
    .select()
    .from(workflowNodes)
    .where(eq(workflowNodes.channelId, channelId))
    .orderBy(asc(workflowNodes.stepOrder))

  const result = new Map<StepType, LoadedNode>()
  for (const node of nodes) {
    if (!node.isEnabled || !node.providerId || !node.model) continue
    try {
      const provider = await getProviderById(node.providerId, node.model)
      result.set(node.stepType as StepType, {
        stepType: node.stepType as StepType,
        provider,
        systemPrompt: node.systemPrompt ?? '',
        temperature: node.temperature ?? 0.8,
        maxTokens: node.maxTokens ?? 2048,
      })
    } catch (err) {
      console.warn(`[Pipeline] Cannot load node "${node.stepType}": ${(err as Error).message}`)
    }
  }
  return result
}

function pickNode(nodes: Map<StepType, LoadedNode>, preferred: StepType, fallbacks: StepType[]): LoadedNode | undefined {
  if (nodes.has(preferred)) return nodes.get(preferred)
  for (const fb of fallbacks) {
    if (nodes.has(fb)) return nodes.get(fb)
  }
  return undefined
}

export async function runPipeline(
  channelId: number,
  triggerType: 'auto' | 'manual' | 'preview',
  bot?: Bot,
): Promise<PipelineResult> {
  const [task] = await db
    .insert(tasks)
    .values({ channelId, triggerType, status: 'running' })
    .returning()
  const taskId = task.id

  try {
    const channelRows = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1)
    const channel = channelRows[0]
    if (!channel) throw new Error(`Channel ${channelId} not found`)

    const configRows = await db.select().from(pipelineConfigs).where(eq(pipelineConfigs.channelId, channelId)).limit(1)
    const config = configRows[0]

    await addLog(taskId, 'info', `Pipeline started for: ${channel.name}`)

    const nodeMap = await loadWorkflowNodes(channelId)
    await addLog(taskId, 'info', `Workflow nodes: [${[...nodeMap.keys()].join(', ')}]`)

    if (nodeMap.size === 0) {
      throw new Error('No workflow nodes configured. Please add at least a "writer" or "brain" node.')
    }

    // ─── STEP 1: Brain (tool-based research) ──────────────────────────────────
    const brainNode = nodeMap.get('brain')
    let researchSummary = ''
    let keywords: string[] = []
    let toolsUsed: string[] = []

    if (brainNode) {
      await addLog(taskId, 'info', `🧠 Brain agent running with ${brainNode.provider.name}...`)
      try {
        const brainResult = await runBrain(
          channel.name,
          channel.description ?? '',
          channel.userIntro ?? '',
          config?.contentStyle ?? 'informative',
          config?.language ?? 'zh',
          brainNode.provider,
          brainNode.systemPrompt || undefined,
        )
        researchSummary = brainResult.researchSummary
        keywords = brainResult.selectedTopics
        toolsUsed = brainResult.toolCalls.map((c) => c.tool)

        const toolLog = brainResult.toolCalls
          .map((c) => `${c.tool}(${JSON.stringify(c.args).slice(0, 60)})`)
          .join(', ')
        await addLog(taskId, 'info', `Brain used tools: [${toolLog}]`)

        const failed = brainResult.toolResults.filter((r) => r.error)
        if (failed.length > 0) {
          await addLog(taskId, 'warn', `Tool failures: ${failed.map((r) => `${r.tool}: ${r.error}`).join('; ')}`)
        }
        await addLog(taskId, 'info', `Research summary ready (${researchSummary.length} chars)`)
      } catch (err) {
        await addLog(taskId, 'warn', `Brain agent failed: ${(err as Error).message}`)
      }
    }

    // ─── STEP 2: Researcher (fallback if no brain) ────────────────────────────
    const researcherNode = pickNode(nodeMap, 'researcher', [])
    if (!brainNode && researcherNode && config?.searchEnabled !== false) {
      await addLog(taskId, 'info', `🔍 Researcher agent running with ${researcherNode.provider.name}...`)
      try {
        const research = await runResearcher(
          channel.name,
          channel.description ?? '',
          channel.userIntro ?? '',
          config?.searchQueryTemplate ?? '',
          researcherNode.provider,
        )
        researchSummary = research.summary || research.formattedResults
        keywords = research.keywords
        toolsUsed = ['search']
        await addLog(taskId, 'info', `Research done: [${research.keywords.join(', ')}], ${research.searchResults.length} results`)
      } catch (err) {
        await addLog(taskId, 'warn', `Researcher failed: ${(err as Error).message}`)
      }
    }

    // ─── STEP 3: Write ────────────────────────────────────────────────────────
    const writerNode = pickNode(nodeMap, 'writer', ['brain'])
    if (!writerNode) throw new Error('No writer or brain node configured.')

    await addLog(taskId, 'info', `✍️ Writer running with ${writerNode.provider.name}...`)
    const writerResult = await runWriter(
      channel.name,
      channel.description ?? '',
      channel.userIntro ?? '',
      { keywords, searchResults: [], summary: researchSummary, formattedResults: researchSummary },
      config?.contentStyle ?? 'informative',
      config?.language ?? 'zh',
      config?.customInstructions ?? '',
      writerNode.provider,
    )
    await addLog(taskId, 'info', `Content written. Topic: "${writerResult.topic}"`)

    // ─── STEP 4: Review ───────────────────────────────────────────────────────
    let finalContent = writerResult.content
    let reviewSuggestions: string | undefined

    const reviewerNode = nodeMap.get('reviewer')
    if (reviewerNode) {
      await addLog(taskId, 'info', `🔎 Reviewer running with ${reviewerNode.provider.name}...`)
      try {
        const reviewed = await runReviewer(
          writerResult.content,
          channel.name,
          channel.description ?? '',
          channel.userIntro ?? '',
          reviewerNode.provider,
        )
        finalContent = reviewed.finalContent
        reviewSuggestions = reviewed.suggestions
        await addLog(taskId, 'info', `Review done: ${reviewed.suggestions}`)
      } catch (err) {
        await addLog(taskId, 'warn', `Reviewer failed: ${(err as Error).message}`)
      }
    }

    // ─── STEP 5 & 6: Prompt + Image ───────────────────────────────────────────
    let imageUrl: string | undefined
    let imagePrompt: string | undefined

    if (config?.imageEnabled !== false) {
      const prompterNode = pickNode(nodeMap, 'prompter', ['brain', 'writer'])

      if (prompterNode) {
        await addLog(taskId, 'info', `🎨 Prompter running with ${prompterNode.provider.name}...`)
        try {
          const prompterResult = await runPrompter(
            writerResult.topic,
            channel.name,
            channel.description ?? '',
            config?.contentStyle ?? 'informative',
            prompterNode.provider,
          )
          imagePrompt = prompterResult.imagePrompt
          await addLog(taskId, 'info', `Image prompt: "${imagePrompt.slice(0, 80)}..."`)

          const illustratorNode = nodeMap.get('illustrator')
          if (illustratorNode) {
            if (!illustratorNode.provider.supportsImages) {
              await addLog(taskId, 'warn', `${illustratorNode.provider.name} (${illustratorNode.provider.providerType}) does not support image generation`)
            } else {
              await addLog(taskId, 'info', `🖼️ Illustrator running with ${illustratorNode.provider.name}...`)
              const illResult = await runIllustrator(imagePrompt, illustratorNode.provider)
              imageUrl = illResult.imageUrl
              await addLog(taskId, 'info', 'Image generated')
            }
          } else {
            await addLog(taskId, 'warn', 'No illustrator node, skipping image')
          }
        } catch (err) {
          await addLog(taskId, 'warn', `Image pipeline failed: ${(err as Error).message}`)
        }
      } else {
        await addLog(taskId, 'warn', 'No prompter node, skipping image')
      }
    }

    // ─── STEP 7: Publish ──────────────────────────────────────────────────────
    let tgMessageId: string | undefined
    if (triggerType !== 'preview' && bot) {
      await addLog(taskId, 'info', `📤 Publishing to ${channel.tgChannelId}...`)
      try {
        tgMessageId = await publishToTelegram(bot, channel.tgChannelId, finalContent, imageUrl)
        await addLog(taskId, 'info', `Published. Message ID: ${tgMessageId}`)
      } catch (err) {
        await addLog(taskId, 'error', `Publish failed: ${(err as Error).message}`)
        throw err
      }
    }

    await db.insert(contentHistory).values({
      taskId,
      channelId,
      textContent: finalContent,
      imageUrl: imageUrl && !imageUrl.startsWith('data:') ? imageUrl : undefined,
      imagePrompt,
      searchKeywords: keywords.join(', '),
      searchResults: researchSummary.slice(0, 2000),
      tgMessageId,
      isPreview: triggerType === 'preview',
    })

    await db.update(tasks)
      .set({ status: 'done', completedAt: new Date().toISOString() })
      .where(eq(tasks.id, taskId))
    await addLog(taskId, 'info', `✅ Pipeline completed. Tools used: [${toolsUsed.join(', ')}]`)

    return { textContent: finalContent, imageUrl, imagePrompt, searchKeywords: keywords.join(', '), tgMessageId, reviewSuggestions, toolsUsed }
  } catch (err) {
    const message = (err as Error).message
    await db.update(tasks)
      .set({ status: 'failed', errorMessage: message, completedAt: new Date().toISOString() })
      .where(eq(tasks.id, taskId))
    await addLog(taskId, 'error', `Pipeline failed: ${message}`)
    throw err
  }
}

async function publishToTelegram(bot: Bot, tgChannelId: string, text: string, imageUrl?: string): Promise<string> {
  if (imageUrl && !imageUrl.startsWith('data:')) {
    const msg = await bot.api.sendPhoto(tgChannelId, imageUrl, { caption: text, parse_mode: 'Markdown' })
    return msg.message_id.toString()
  }
  if (imageUrl?.startsWith('data:')) {
    const { InputFile } = await import('grammy')
    const buffer = Buffer.from(imageUrl.split(',')[1], 'base64')
    const msg = await bot.api.sendPhoto(tgChannelId, new InputFile(buffer, 'image.jpg'), {
      caption: text, parse_mode: 'Markdown',
    })
    return msg.message_id.toString()
  }
  const msg = await bot.api.sendMessage(tgChannelId, text, { parse_mode: 'Markdown' })
  return msg.message_id.toString()
}
