import type { AIProvider } from '../../providers/types.js'
import type { CreativeBrief } from './brain.js'
import { extractJson } from '../utils.js'

export interface ReviewerResult {
  finalContent: string
  suggestions: string
  approved: boolean
}

/**
 * Reviewer agent — two checks:
 * 1. Relevance: Does the content match the channel and the brain's creative brief?
 * 2. Naturalness: Remove AI-flavored phrases, make it feel human-written.
 */
export async function runReviewer(
  content: string,
  channelName: string,
  channelDescription: string,
  userIntro: string,
  reviewProvider: AIProvider,
  creativeBrief?: CreativeBrief,
): Promise<ReviewerResult> {
  const systemPrompt =
    `你是一个严格的内容审校编辑，专门负责在内容发布前进行最后把关。
你有两个核心职责：
1. 确保内容与频道定位相关、符合创作简报的方向
2. 消除 AI 腔调，让文字读起来像真人写的`

  const briefSection = creativeBrief
    ? `## 原始创作简报（检查是否执行到位）
- 话题：${creativeBrief.topic}
- 切入角度：${creativeBrief.angle}
- 要求语气：${creativeBrief.writingTone}
- 必须包含：${creativeBrief.keyPoints.join('；')}
- 禁止涉及：${creativeBrief.avoidTopics.join('；') || '无'}

`
    : ''

  const userPrompt = `请审校以下 Telegram 帖子草稿，为频道「${channelName}」发布前做最后优化。

【频道定位】${channelDescription}
【运营备注】${userIntro || '无'}

${briefSection}## 待审稿件
${content}

## 审校任务

**第一步：内容相关性检查**
- 内容是否与频道「${channelName}」的定位相关？
- 是否按照创作简报的方向来写的？
- 如果跑题，直接标记 approved: false

**第二步：去除 AI 腔**
检查并替换以下类型的 AI 腔表达：
- "随着...的不断发展" → 用具体事件替代
- "值得注意的是" → 删除或直接说结论
- "不得不说" / "毋庸置疑" → 删除
- "与此同时" → 换个连接方式或拆句
- "作为一名..." → 删除
- 段落末尾的"你觉得呢？欢迎评论区留言～" → 换成更自然的收尾

**第三步：优化但不要大改**
- 保留原文的信息和结构
- 只改语言风格，不改核心内容
- 字数与原文相差不超过 20%

按如下 JSON 格式返回，不要其他内容：
{
  "approved": true 或 false,
  "suggestions": "用一句话说明主要改了什么",
  "finalContent": "修改后的完整帖子内容"
}`

  const raw = await reviewProvider.generateText(userPrompt, {
    systemPrompt,
    temperature: 0.3,
    maxTokens: 1600,
  })

  try {
    const parsed = extractJson<{ approved: boolean; suggestions: string; finalContent: string }>(raw)
    if (parsed) {
      return {
        finalContent: parsed.finalContent?.trim() || content,
        suggestions: parsed.suggestions || '',
        approved: parsed.approved !== false,
      }
    }
  } catch {
    // JSON parse failed
  }

  return {
    finalContent: content,
    suggestions: '审校输出解析失败，使用原始内容',
    approved: true,
  }
}
