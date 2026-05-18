import type { AIProvider } from '../../providers/types.js'
import type { ResearchResult } from './researcher.js'
import type { CreativeBrief } from './brain.js'

export interface WriterResult {
  content: string
  topic: string
}

/** Anti-AI writing guidelines injected into every writer prompt */
const ANTI_AI_RULES = `
【反 AI 腔写作规范 - 必须严格遵守】

❌ 绝对禁止出现的表达：
- "随着...的不断发展" / "在当今社会" / "不得不说" / "本文将"
- "总的来说" / "综上所述" / "毫无疑问" / "由此可见"
- "值得注意的是" / "不可否认" / "与此同时"
- "作为一个..." / "众所周知" / "不言而喻"
- 段落结尾不要用"你觉得呢？欢迎在评论区留言分享～"（太模板化）
- 不要每段都用加粗 + emoji 的"小红书体"
- 避免固定的"引入 -> 三点分析 -> 总结呼吁"这种死板结构。

✅ 要做到的：
- 每次文章的排版和结构都要有差异化（可以使用故事引入、直接抛出干货、反常识观点起手、或者纯粹分享心情）。
- 内容必须紧密结合频道的定位，提供具体的细节、实例或独到见解，绝对不要泛泛而谈。
- 第一句必须直接说事，不铺垫
- 用具体数字、真实例子代替笼统表述
- 句子长短交替，有节奏感，像真人说话
- 可以有个人立场和主观判断，不要只是"客观介绍"
- 充分且自然地使用 Emoji 表情符号来丰富文章情绪，让排版更生动可爱。
- 充分利用 Telegram 的文本排版格式增强可读性（如：*粗体*、_斜体_、__下划线__、\\`代码行\\`），拒绝干瘪的纯文本。
- 每段要有独立的信息量，不要废话填充
- 结尾自然收尾即可，不要刻意总结，也不要总是强行提问互动。
`.trim()

/**
 * Writer receives creative brief from brain and executes the writing.
 * The brief contains all creative decisions — writer only implements.
 */
export async function runWriter(
  channelName: string,
  channelDescription: string,
  userIntro: string,
  research: ResearchResult | { keywords: string[]; searchResults: unknown[]; summary: string; formattedResults: string },
  contentStyle: string,
  language: string,
  customInstructions: string,
  textProvider: AIProvider,
  creativeBrief?: CreativeBrief,
): Promise<WriterResult> {
  const langLabel = language === 'zh' ? '简体中文' : language === 'zh-tw' ? '繁体中文' : language

  const systemPrompt = `你是一个为 Telegram 频道「${channelName}」服务的专职内容创作者。
你非常了解这个频道的受众和内容风格。
你的文字读起来像是真人在认真写作，而不是 AI 生成的。
${customInstructions ? `\n特别要求：${customInstructions}` : ''}`

  let userPrompt: string

  if (creativeBrief) {
    // ─── Mode 1: Follow brain's creative brief ────────────────────────────────
    userPrompt = `按照以下创作简报，为 Telegram 频道「${channelName}」写一篇帖子。

【频道定位】${channelDescription}
【运营备注】${userIntro || '无'}
【发布语言】${langLabel}

## 创作简报（必须严格执行）
- 核心话题：${creativeBrief.topic}
- 切入角度：${creativeBrief.angle}
- 文章结构形式：尽量与常规内容不同，避免千篇一律的排版，可以采用日记体、问答体、故事体或直接列要点等形式。
- 写作语气：${creativeBrief.writingTone}
- 篇幅字数要求：${creativeBrief.contentLength}
- 开头示例：${creativeBrief.openingHook || '自由发挥，但要抓眼球'}
- 必须包含的关键信息：${creativeBrief.keyPoints.join('；')}
- 不要涉及：${creativeBrief.avoidTopics.join('；') || '无限制'}
- 结尾加上标签：${creativeBrief.hashtagSuggestions.join(' ')}

## 参考素材
${research.summary || research.formattedResults || '无外部素材，基于话题进行原创'}

${ANTI_AI_RULES}

## 输出要求
- 语言：${langLabel}
- 字数：必须严格遵守上方设定的【篇幅字数要求】，确保字数在此范围内
- 直接输出帖子正文，不要加"帖子如下："等前缀
- 禁用传统的 Markdown 标题（#，##等），请使用 Telegram 样式（如 *粗体*，_斜体_，__下划线__，\\`代码\\`）来做重点突出和视觉分隔。
- 结尾的 hashtag 独立一行`
  } else {
    // ─── Mode 2: No brain, write from research directly ───────────────────────
    userPrompt = `为 Telegram 频道「${channelName}」写一篇今日帖子。

【频道定位】${channelDescription}
【运营备注】${userIntro || '无'}
【内容风格】${contentStyle}
【发布语言】${langLabel}

## 参考信息
${research.summary || research.formattedResults || '请基于频道定位进行原创'}

${ANTI_AI_RULES}

## 输出要求
- 语言：${langLabel}
- 内容：请发挥创意，从「${channelName}」频道定位的细分领域切入。如果参考信息为空，你需要自己构思一个有趣、有价值的相关话题。
- 结构：每次都要尝试不同的排版形式（例如：日记体、问答体、故事、干货清单、碎碎念等）。
- 字数：随机决定篇幅（例如有些时候很短50字，有时候很长400字，不要每次都一样）
- 格式：禁用传统的 Markdown 标题（#，##），必须使用 Telegram 支持的文本样式（*粗体*、_斜体_、__下划线__、\\`代码行\\`）来进行排版。
- 直接输出帖子内容
- 结尾附上 3-5 个相关 hashtag`
  }

  const content = await textProvider.generateText(userPrompt, {
    systemPrompt,
    temperature: 0.82,
    maxTokens: 1200,
  })

  // Prefer the brain's topic from the creative brief to avoid an extra API call
  // (also avoids issues with reasoning models eating all tokens on a short maxTokens task)
  let topic = creativeBrief?.topic?.trim() ?? ''

  if (!topic) {
    // Fallback: extract from content — first try first non-empty line, then API call
    const firstLine = content.split('\n').find((l) => l.trim().length > 0) ?? ''
    // Use first line if short enough, otherwise ask the model
    if (firstLine.length <= 30) {
      topic = firstLine.replace(/[*_#。，、！？]/g, '').trim()
    } else {
      try {
        const topicPrompt = `用 5-8 个字概括以下帖子的核心主题，只输出主题词，不要标点符号：\n\n${content.slice(0, 300)}`
        const extracted = await textProvider.generateText(topicPrompt, {
          temperature: 0.2,
          maxTokens: 200,   // large enough for reasoning models
        })
        topic = extracted.trim().replace(/[。，、！？\n]/g, '').slice(0, 40)
      } catch {
        // Last resort: use first 20 chars of content
        topic = content.slice(0, 20).replace(/[*_#\n]/g, '').trim()
      }
    }
  }

  return {
    content: content.trim(),
    topic,
  }
}
