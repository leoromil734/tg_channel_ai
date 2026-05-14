import { db } from '../db/index.js'
import { channels, pipelineConfigs, workflowNodes, tasks, taskLogs, contentHistory } from '../db/schema.js'
import { eq, asc, desc } from 'drizzle-orm'
import { getProviderById } from '../providers/index.js'
import { runBrain, type CreativeBrief, type RecentPost } from './agents/brain.js'
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
  usedSearch?: boolean
}

export type PipelineStepName =
  | 'brain'
  | 'researcher'
  | 'writer'
  | 'reviewer'
  | 'prompter'
  | 'illustrator'
  | 'publishing'
  | 'done'
  | 'failed'

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

async function setStep(taskId: number, step: PipelineStepName) {
  await db.update(tasks).set({ currentStep: step }).where(eq(tasks.id, taskId))
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

async function fetchRecentPosts(channelId: number, limit = 5): Promise<RecentPost[]> {
  const rows = await db
    .select({ textContent: contentHistory.textContent, createdAt: contentHistory.createdAt })
    .from(contentHistory)
    .where(eq(contentHistory.channelId, channelId))
    .orderBy(desc(contentHistory.createdAt))
    .limit(limit)
  return rows.map((r) => ({ textContent: r.textContent ?? '', createdAt: r.createdAt ?? '' }))
}

/**
 * Called by the scheduler (auto) — creates its own task row.
 */
export async function runPipeline(
  channelId: number,
  triggerType: 'auto' | 'manual' | 'preview',
  bot?: Bot,
): Promise<PipelineResult> {
  const [task] = await db
    .insert(tasks)
    .values({ channelId, triggerType, status: 'running', currentStep: 'brain' })
    .returning()
  const taskId = task.id
  return runPipelineCore(taskId, channelId, triggerType, bot)
}

/**
 * Called by the API after creating the task row up-front (async endpoint).
 * Marks the task running and executes the pipeline.
 */
export async function runPipelineWithTask(
  taskId: number,
  channelId: number,
  triggerType: 'auto' | 'manual' | 'preview',
  bot?: Bot,
): Promise<PipelineResult> {
  await db.update(tasks)
    .set({ status: 'running', currentStep: 'brain' })
    .where(eq(tasks.id, taskId))
  return runPipelineCore(taskId, channelId, triggerType, bot)
}

async function runPipelineCore(
  taskId: number,
  channelId: number,
  triggerType: 'auto' | 'manual' | 'preview',
  bot?: Bot,
): Promise<PipelineResult> {

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

    // Fetch recent content for brain context
    const recentPosts = await fetchRecentPosts(channelId, 5)
    if (recentPosts.length > 0) {
      await addLog(taskId, 'info', `Found ${recentPosts.length} recent posts for context`)
    }

    // ─── STEP 1: Brain ────────────────────────────────────────────────────────
    const brainNode = nodeMap.get('brain')
    let researchData = ''
    let keywords: string[] = []
    let toolsUsed: string[] = []
    let creativeBrief: CreativeBrief | undefined
    let usedSearch = false

    await setStep(taskId, 'brain')

    if (brainNode) {
      await addLog(taskId, 'info', `🧠 Brain [${brainNode.provider.name}] 开始决策...`)
      try {
        const brainResult = await runBrain(
          channel.name,
          channel.description ?? '',
          channel.userIntro ?? '',
          config?.contentStyle ?? 'informative',
          config?.language ?? 'zh',
          brainNode.provider,
          recentPosts,
          brainNode.systemPrompt || undefined,
        )
        researchData = brainResult.researchData
        keywords = brainResult.selectedTopics
        toolsUsed = brainResult.toolCalls.map((c) => c.tool)
        creativeBrief = brainResult.creativeBrief
        usedSearch = brainResult.usedSearch

        if (usedSearch) {
          const toolLog = brainResult.toolCalls.map((c) => `${c.tool}(${JSON.stringify(c.args).slice(0, 60)})`).join(', ')
          await addLog(taskId, 'info', `🔍 Brain 选择联网：[${toolLog}]`)
          const failed = brainResult.toolResults.filter((r) => r.error)
          if (failed.length > 0) {
            await addLog(taskId, 'warn', `工具失败: ${failed.map((r) => `${r.tool}: ${r.error}`).join('; ')}`)
          }
        } else {
          await addLog(taskId, 'info', `💡 Brain 决定不联网，基于自身知识创作`)
        }
        await addLog(taskId, 'info', `📋 创作简报: "${creativeBrief.topic}" | 语气: ${creativeBrief.writingTone}`)
      } catch (err) {
        await addLog(taskId, 'warn', `Brain agent failed: ${(err as Error).message}`)
      }
    }

    // ─── STEP 2: Researcher (fallback if no brain) ────────────────────────────
    const researcherNode = pickNode(nodeMap, 'researcher', [])
    if (!brainNode && researcherNode && config?.searchEnabled !== false) {
      await setStep(taskId, 'researcher')
      await addLog(taskId, 'info', `🔍 Researcher [${researcherNode.provider.name}] 运行中...`)
      try {
        const research = await runResearcher(
          channel.name,
          channel.description ?? '',
          channel.userIntro ?? '',
          config?.searchQueryTemplate ?? '',
          researcherNode.provider,
        )
        researchData = research.summary || research.formattedResults
        keywords = research.keywords
        toolsUsed = ['search']
        await addLog(taskId, 'info', `研究完成: [${research.keywords.join(', ')}], ${research.searchResults.length} 条结果`)
      } catch (err) {
        await addLog(taskId, 'warn', `Researcher failed: ${(err as Error).message}`)
      }
    }

    // ─── STEP 3: Write ────────────────────────────────────────────────────────
    await setStep(taskId, 'writer')
    const writerNode = pickNode(nodeMap, 'writer', ['brain'])
    if (!writerNode) throw new Error('No writer or brain node configured.')

    await addLog(taskId, 'info', `✍️ Writer [${writerNode.provider.name}] 创作中...`)
    const writerResult = await runWriter(
      channel.name,
      channel.description ?? '',
      channel.userIntro ?? '',
      { keywords, searchResults: [], summary: researchData, formattedResults: researchData },
      config?.contentStyle ?? 'informative',
      config?.language ?? 'zh',
      config?.customInstructions ?? '',
      writerNode.provider,
      creativeBrief,
    )
    await addLog(taskId, 'info', `内容创作完成，话题: "${writerResult.topic}"`)

    // ─── STEP 4: Review ───────────────────────────────────────────────────────
    let finalContent = writerResult.content
    let reviewSuggestions: string | undefined

    const reviewerNode = nodeMap.get('reviewer')
    if (reviewerNode) {
      await setStep(taskId, 'reviewer')
      await addLog(taskId, 'info', `🔎 Reviewer [${reviewerNode.provider.name}] 审校中...`)
      try {
        const reviewed = await runReviewer(
          writerResult.content,
          channel.name,
          channel.description ?? '',
          channel.userIntro ?? '',
          reviewerNode.provider,
          creativeBrief,
        )
        finalContent = reviewed.finalContent
        reviewSuggestions = reviewed.suggestions
        if (!reviewed.approved) {
          await addLog(taskId, 'warn', `审校不通过，但仍使用修改后内容: ${reviewed.suggestions}`)
        } else {
          await addLog(taskId, 'info', `审校通过: ${reviewed.suggestions}`)
        }
      } catch (err) {
        await addLog(taskId, 'warn', `Reviewer failed: ${(err as Error).message}`)
      }
    }

    // ─── STEP 5 & 6: Prompt + Image ───────────────────────────────────────────
    let imageUrl: string | undefined
    let imagePrompt: string | undefined

    if (config?.imageEnabled !== false && creativeBrief?.useImage !== false) {
      const prompterNode = pickNode(nodeMap, 'prompter', ['brain', 'writer'])

      if (prompterNode) {
        await setStep(taskId, 'prompter')
        await addLog(taskId, 'info', `🎨 Prompter [${prompterNode.provider.name}] 生成图片提示词...`)
        try {
          const prompterResult = await runPrompter(
            writerResult.topic,
            channel.name,
            channel.description ?? '',
            config?.contentStyle ?? 'informative',
            prompterNode.provider,
            creativeBrief,
          )
          imagePrompt = prompterResult.imagePrompt
          await addLog(taskId, 'info', `图片提示词: "${imagePrompt.slice(0, 80)}..."`)

          const illustratorNode = nodeMap.get('illustrator')
          if (illustratorNode) {
            if (!illustratorNode.provider.supportsImages) {
              await addLog(taskId, 'warn', `${illustratorNode.provider.name} 不支持图片生成，跳过`)
            } else {
              await setStep(taskId, 'illustrator')
              await addLog(taskId, 'info', `🖼️ Illustrator [${illustratorNode.provider.name}] 绘图中...`)
              const illResult = await runIllustrator(imagePrompt, illustratorNode.provider)
              imageUrl = illResult.imageUrl
              await addLog(taskId, 'info', '图片生成完成')
            }
          } else {
            await addLog(taskId, 'warn', '未配置 illustrator 节点，跳过生图')
          }
        } catch (err) {
          await addLog(taskId, 'warn', `图片流程失败: ${(err as Error).message}`)
        }
      } else {
        await addLog(taskId, 'warn', '未配置 prompter 节点，跳过图片')
      }
    }

    // ─── STEP 7: Publish ──────────────────────────────────────────────────────
    let tgMessageId: string | undefined
    if (triggerType !== 'preview' && bot) {
      await setStep(taskId, 'publishing')
      await addLog(taskId, 'info', `📤 发布到 ${channel.tgChannelId}...`)
      try {
        tgMessageId = await publishToTelegram(bot, channel.tgChannelId, finalContent, imageUrl)
        await addLog(taskId, 'info', `发布成功，消息 ID: ${tgMessageId}`)
      } catch (err) {
        await addLog(taskId, 'error', `发布失败: ${(err as Error).message}`)
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
      searchResults: researchData.slice(0, 2000),
      tgMessageId,
      isPreview: triggerType === 'preview',
    })

    await setStep(taskId, 'done')
    await db.update(tasks)
      .set({ status: 'done', completedAt: new Date().toISOString() })
      .where(eq(tasks.id, taskId))
    await addLog(taskId, 'info', `✅ Pipeline 完成。使用工具: [${toolsUsed.join(', ') || '无（自主创作）'}]`)

    return { textContent: finalContent, imageUrl, imagePrompt, searchKeywords: keywords.join(', '), tgMessageId, reviewSuggestions, toolsUsed, usedSearch }
  } catch (err) {
    const message = (err as Error).message
    await setStep(taskId, 'failed')
    await db.update(tasks)
      .set({ status: 'failed', errorMessage: message, completedAt: new Date().toISOString() })
      .where(eq(tasks.id, taskId))
    await addLog(taskId, 'error', `Pipeline 失败: ${message}`)
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
