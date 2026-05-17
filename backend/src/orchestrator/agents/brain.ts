import { getToolDescriptionText, executeTools, type ToolCall, type ToolResult } from '../../tools/registry.js'
import type { AIProvider } from '../../providers/types.js'
import { extractJson } from '../utils.js'

export interface RecentPost {
  textContent: string
  createdAt: string
}

export interface CreativeBrief {
  topic: string
  angle: string
  keyPoints: string[]
  writingTone: string
  openingHook: string
  avoidTopics: string[]
  hashtagSuggestions: string[]
  useImage: boolean
  imageConceptHint: string
  imageStyle: string
  contentLength: string
  useSearch: boolean
  reasoning: string
}

export interface BrainResult {
  toolCalls: ToolCall[]
  toolResults: ToolResult[]
  researchData: string
  creativeBrief: CreativeBrief
  selectedTopics: string[]
  usedSearch: boolean
}

const MAX_TOOL_CALLS = 4

/**
 * Brain agent — two-phase decision maker.
 *
 * Phase 1: Analyze channel context + recent posts → decide whether to search
 *          online, and if so, which tools to use.
 * Phase 2: With research data (or without if skipped), produce a full creative
 *          brief that the writer must follow exactly.
 *
 * Key: the brain can choose toolCalls: [] to skip all internet research and
 * write entirely from its own knowledge + recent channel content.
 */
export async function runBrain(
  channelName: string,
  channelDescription: string,
  userIntro: string,
  contentStyle: string,
  language: string,
  brainProvider: AIProvider,
  recentPosts: RecentPost[] = [],
  customSystemPrompt?: string,
): Promise<BrainResult> {
  const toolDocs = getToolDescriptionText()
  const langLabel = language === 'zh' ? '简体中文' : language === 'zh-tw' ? '繁体中文' : language
  const hasEnoughHistory = recentPosts.length >= 3

  const recentPostsSection =
    recentPosts.length > 0
      ? `## 频道最近 ${recentPosts.length} 条发布内容（避免重复，了解频道风格）
${recentPosts
  .map(
    (p, i) =>
      `[${i + 1}] (${p.createdAt.slice(0, 10)}) ${p.textContent.slice(0, 200)}${p.textContent.length > 200 ? '…' : ''}`,
  )
  .join('\n\n')}`
      : '## 频道历史内容：暂无（频道刚建立或内容很少）'

  // ─── Phase 1: Decide whether & what to research ───────────────────────────
  const phase1System =
    customSystemPrompt ||
    `你是负责 Telegram 频道「${channelName}」内容运营的首席策略大脑。
你掌握频道的全部背景信息，深刻理解受众需求和内容调性。
你是唯一的决策者——后续所有角色都严格执行你的指令。`

  const phase1Prompt = `你正在为 Telegram 频道制定今天的内容策略：

【频道名称】${channelName}
【频道简介】${channelDescription}
【运营备注】${userIntro || '无特别说明'}
【内容风格】${contentStyle}
【发布语言】${langLabel}

${recentPostsSection}

## 可用的联网工具（你可以选择完全不用）
${toolDocs}

## 核心决策：今天是否需要联网搜索？

判断标准：
- **需要搜索**：新闻类、时事类、行业动态类频道；话题需要最新数据支撑；最近内容质量依赖外部信息
- **不需要搜索**：${hasEnoughHistory ? '频道已有足够内容作为参考，大模型自身知识足以支撑创作；' : ''}话题相对稳定、偏娱乐/生活/技巧类；或者你判断今天适合基于已有知识自由创作

你可以输出 "toolCalls": [] 来跳过联网，直接基于自身知识创作。

只返回如下 JSON，不要任何额外说明：
{
  "reasoning": "简短说明决策思路：为什么选择搜索或不搜索，以及大概写什么方向",
  "selectedTopics": ["主题1", "主题2"],
  "toolCalls": [
    {"tool": "工具名", "args": {"参数": "值"}, "reason": "为什么用这个工具"}
  ]
}

规则：
- toolCalls 可以为空数组（表示不联网）
- 如要搜索，最多 ${MAX_TOOL_CALLS} 个工具调用
- tool 名称必须完全匹配：search / scrape / rss / wikipedia / trending / news`

  const phase1Raw = await brainProvider.generateText(phase1Prompt, {
    systemPrompt: phase1System,
    temperature: 0.35,
    maxTokens: 700,
  })

  let toolCalls: ToolCall[] = []
  let reasoning = ''
  let selectedTopics: string[] = []
  let decideToSearch = true

  try {
    const parsed = extractJson<{ reasoning?: string; selectedTopics?: string[]; toolCalls?: ToolCall[] }>(phase1Raw)
    if (parsed) {
      toolCalls = (parsed.toolCalls ?? []).slice(0, MAX_TOOL_CALLS)
      reasoning = parsed.reasoning ?? ''
      selectedTopics = parsed.selectedTopics ?? []
      decideToSearch = toolCalls.length > 0
    }
  } catch {
    // Parse failed: fall back to a default search
    toolCalls = [{ tool: 'search', args: { query: `${channelDescription.slice(0, 50)} 最新动态` } }]
    decideToSearch = true
  }

  // ─── Execute tools (if any) ───────────────────────────────────────────────
  let toolResults: ToolResult[] = []
  let rawData = ''

  if (decideToSearch && toolCalls.length > 0) {
    toolResults = await executeTools(toolCalls)
    const successResults = toolResults.filter((r) => !r.error && r.output)
    rawData = successResults.map((r) => `【${r.tool.toUpperCase()}】\n${r.output}`).join('\n\n━━━\n\n')
  }

  // ─── Phase 2: Generate creative brief ─────────────────────────────────────
  const phase2System = `你是一个资深内容总监，专门为自媒体频道规划内容创意。
你非常擅长：
- 从信息中提炼真正有价值、读者愿意看的角度
- 设计让人眼前一亮的内容开头
- 确保内容与频道调性完全一致
- 识别哪些内容会让读者觉得"这就是在说我"或"这个我必须转发"`

  const dataSection = rawData
    ? `## 联网采集到的原始信息\n${rawData.slice(0, 5000)}`
    : `## 未进行联网搜索\n基于以下信息创作：频道背景知识 + 大模型自身知识储备${recentPosts.length > 0 ? ' + 频道历史内容风格' : ''}`

  const phase2Prompt = `你在为 Telegram 频道「${channelName}」策划今天的内容。

【频道定位】${channelDescription}
【运营备注】${userIntro || '无'}
【内容风格】${contentStyle}
【发布语言】${langLabel}
【策略思路】${reasoning}

${recentPostsSection}

${dataSection}

## 你的任务
制定一份完整的创作简报（Creative Brief），指导后续写手完成今天的帖子。

重点要求：
1. 内容必须与频道「${channelName}」的定位高度相关
2. 不要重复最近已发布的话题（查看历史内容）
3. 选一个最有价值、最能引发读者共鸣的切入角度
4. 设计抓眼球的开头句子（不要用"随着...""在当今..."等老套套路）
5. 指定写作语气，贴近真人写作，避免 AI 腔调

只返回如下 JSON 格式，字段都用${langLabel}填写：
{
  "topic": "今天要写的核心话题（一句话）",
  "angle": "独特切入角度，说明为什么这个角度比直接介绍更有吸引力",
  "keyPoints": ["要包含的关键信息1", "关键信息2", "关键信息3"],
  "writingTone": "具体的语气要求，例如：犀利吐槽型 / 朋友聊天型 / 干货分享型 / 情感共鸣型，每次都要有所变化",
  "contentLength": "随机决定今天的篇幅：必须从 '短篇 (50-150字)'、'中篇 (150-300字)' 或 '长篇 (300-500字)' 中选一个，追求每天字数和节奏感都有极大差异",
  "openingHook": "第一句话的写法示例，直接给出开头句子",
  "avoidTopics": ["不要提及的内容（如已发布的话题）"],
  "hashtagSuggestions": ["#标签1", "#标签2", "#标签3"],
  "useImage": true或false,
  "imageConceptHint": "图片要表达的视觉概念（画面主体和内容）",
  "imageStyle": "随机指定一种极具差异化的视觉风格，例如：水彩绘本、3D黏土、真实摄影、赛博朋克、复古像素、极简线稿、油画、动漫风格等，确保每次风格迥异",
  "useSearch": ${decideToSearch},
  "reasoning": "为什么选这个角度和话题"
}`

  const briefRaw = await brainProvider.generateText(phase2Prompt, {
    systemPrompt: phase2System,
    temperature: 0.65,
    maxTokens: 900,
  })

  let creativeBrief: CreativeBrief = {
    topic: `关于${channelName}的今日内容`,
    angle: '直接分享有价值的信息',
    keyPoints: selectedTopics,
    writingTone: '自然亲切，像朋友聊天',
    openingHook: '',
    avoidTopics: [],
    hashtagSuggestions: [],
    useImage: true,
    imageConceptHint: channelDescription,
    imageStyle: '现代商业风格，高质量',
    contentLength: '中篇 (150-300字)',
    useSearch: decideToSearch,
    reasoning,
  }

  try {
    const parsed = extractJson<Partial<CreativeBrief>>(briefRaw)
    if (parsed) creativeBrief = { ...creativeBrief, ...parsed }
  } catch {
    // Keep defaults
  }

  return {
    toolCalls,
    toolResults,
    researchData: rawData,
    creativeBrief,
    selectedTopics,
    usedSearch: decideToSearch && toolCalls.length > 0,
  }
}
