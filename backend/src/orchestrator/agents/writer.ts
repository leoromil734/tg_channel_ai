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
- "随着...的不断发展" / "在当今社会" / "不得不说"
- "总的来说" / "综上所述" / "毫无疑问"
- "值得注意的是" / "不可否认" / "与此同时"
- "作为一个..." / "众所周知" / "不言而喻"
- 段落结尾不要用"你觉得呢？欢迎在评论区留言分享～"（太模板化）
- 不要每段都用加粗 + emoji 的"小红书体"

✅ 要做到的：
- 第一句必须直接说事，不铺垫
- 用具体数字、真实例子代替笼统表述
- 句子长短交替，有节奏感，像真人说话
- 可以有个人立场和主观判断，不要只是"客观介绍"
- emoji 用得克制，只在真正需要强调的地方用
- 每段要有独立的信息量，不要废话填充
- 结尾可以是问题、预测、行动建议或留个悬念，但要自然
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
- 写作语气：${creativeBrief.writingTone}
- 开头示例：${creativeBrief.openingHook || '自由发挥，但要抓眼球'}
- 必须包含的关键信息：${creativeBrief.keyPoints.join('；')}
- 不要涉及：${creativeBrief.avoidTopics.join('；') || '无限制'}
- 结尾加上标签：${creativeBrief.hashtagSuggestions.join(' ')}

## 参考素材
${research.summary || research.formattedResults || '无外部素材，基于话题进行原创'}

${ANTI_AI_RULES}

## 输出要求
- 语言：${langLabel}
- 字数：200-450字（Telegram 帖子适宜长度）
- 直接输出帖子正文，不要加"帖子如下："等前缀
- 不要 Markdown 标题，Telegram 用 *粗体* _斜体_ 格式
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
- 字数：200-450字
- 直接输出帖子内容
- 结尾附上 3-5 个相关 hashtag`
  }

  const content = await textProvider.generateText(userPrompt, {
    systemPrompt,
    temperature: 0.82,
    maxTokens: 1200,
  })

  // Extract a short topic label for the image prompt step
  const topicPrompt = `用 5-8 个字概括以下帖子的核心主题，只输出主题词，不要标点符号：\n\n${content.slice(0, 300)}`
  const topic = await textProvider.generateText(topicPrompt, {
    temperature: 0.2,
    maxTokens: 30,
  })

  return {
    content: content.trim(),
    topic: topic.trim().replace(/[。，、！？\n]/g, ''),
  }
}
