import { search, formatSearchResults } from './search.js'
import { scrape } from './scrape.js'
import { readRss, formatRssResults } from './rss.js'
import { wikipedia } from './wikipedia.js'
import { getTrending, formatTrending } from './trending.js'
import { getNews, formatNews } from './news.js'

// ─── Tool call types ──────────────────────────────────────────────────────────

export interface ToolCall {
  tool: ToolName
  args: Record<string, unknown>
  reason?: string
}

export interface ToolResult {
  tool: ToolName
  args: Record<string, unknown>
  output: string
  error?: string
}

export type ToolName =
  | 'search'
  | 'scrape'
  | 'rss'
  | 'wikipedia'
  | 'trending'
  | 'news'

// ─── Tool definitions for LLM ─────────────────────────────────────────────────

export interface ToolDefinition {
  name: ToolName
  description: string
  parameters: Record<string, { type: string; description: string; required?: boolean }>
  example: ToolCall
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'search',
    description: '在互联网上搜索最新资讯、文章或信息。适合获取近期新闻、事件动态、行业趋势等。优先使用此工具。',
    parameters: {
      query: { type: 'string', description: '搜索关键词，建议使用具体的中文或英文词汇', required: true },
      maxResults: { type: 'number', description: '返回结果数量，默认 5，最多 10' },
    },
    example: { tool: 'search', args: { query: 'ChatGPT 最新功能 2025', maxResults: 5 }, reason: '搜索 AI 领域最新动态' },
  },
  {
    name: 'scrape',
    description: '抓取并解析指定网页的完整内容。适合深入阅读搜索结果中的某篇具体文章。',
    parameters: {
      url: { type: 'string', description: '要抓取的完整 URL（https://...）', required: true },
    },
    example: { tool: 'scrape', args: { url: 'https://example.com/article' }, reason: '获取文章详细内容' },
  },
  {
    name: 'rss',
    description: '从指定 RSS/Atom feed 获取最新文章列表。适合订阅特定媒体或博客的定期更新。',
    parameters: {
      url: { type: 'string', description: 'RSS feed 地址', required: true },
      maxItems: { type: 'number', description: '最多获取条目数，默认 5' },
    },
    example: { tool: 'rss', args: { url: 'https://techcrunch.com/feed/', maxItems: 5 }, reason: '获取科技圈最新文章' },
  },
  {
    name: 'wikipedia',
    description: '查询 Wikipedia 百科全书，获取某个主题的权威背景知识和定义。适合内容需要事实依据时使用。',
    parameters: {
      topic: { type: 'string', description: '要查询的主题名称', required: true },
      lang: { type: 'string', description: '语言代码，如 zh（中文）、en（英文），默认 zh' },
    },
    example: { tool: 'wikipedia', args: { topic: '大语言模型', lang: 'zh' }, reason: '获取 LLM 的定义和背景知识' },
  },
  {
    name: 'trending',
    description: '获取当前热点话题和趋势关键词。适合找到今日热门议题进行借势创作。',
    parameters: {
      geo: { type: 'string', description: '地区代码，如 CN（中国）、US（美国）、GLOBAL，默认 CN' },
      type: { type: 'string', description: '来源类型：google（谷歌趋势）、github（技术趋势）、hackernews（科技社区）、all（全部），默认 all' },
    },
    example: { tool: 'trending', args: { geo: 'CN', type: 'all' }, reason: '了解今日热点话题' },
  },
  {
    name: 'news',
    description: '聚合获取与主题相关的最新新闻。自动匹配科技、AI、金融、加密货币等分类 RSS 源。',
    parameters: {
      query: { type: 'string', description: '新闻主题关键词', required: true },
      maxItems: { type: 'number', description: '返回新闻数量，默认 5' },
    },
    example: { tool: 'news', args: { query: '人工智能', maxItems: 5 }, reason: '获取 AI 行业新闻' },
  },
]

export function getToolDescriptionText(): string {
  return TOOL_DEFINITIONS.map((t) => {
    const params = Object.entries(t.parameters)
      .map(([k, v]) => `  - ${k} (${v.type}${v.required ? ', required' : ''}): ${v.description}`)
      .join('\n')
    return `### ${t.name}\n${t.description}\nParameters:\n${params}\nExample: ${JSON.stringify(t.example)}`
  }).join('\n\n')
}

// ─── Tool executor ────────────────────────────────────────────────────────────

export async function executeTool(call: ToolCall): Promise<ToolResult> {
  try {
    let output = ''

    switch (call.tool) {
      case 'search': {
        const results = await search(
          call.args.query as string,
          { maxResults: (call.args.maxResults as number | undefined) ?? 5 },
        )
        output = formatSearchResults(results)
        break
      }

      case 'scrape': {
        const result = await scrape(call.args.url as string)
        output = `**${result.title}**\n${result.byline ? `By: ${result.byline}\n` : ''}${result.publishedDate ? `Date: ${result.publishedDate}\n` : ''}\n${result.content}`
        break
      }

      case 'rss': {
        const result = await readRss(
          call.args.url as string,
          (call.args.maxItems as number | undefined) ?? 5,
        )
        output = formatRssResults(result)
        break
      }

      case 'wikipedia': {
        const result = await wikipedia(
          call.args.topic as string,
          (call.args.lang as string | undefined) ?? 'zh',
        )
        output = `**${result.title}**\n${result.url}\n\n${result.extract}`
        break
      }

      case 'trending': {
        const topics = await getTrending({
          geo: (call.args.geo as string | undefined) ?? 'CN',
          type: (call.args.type as 'google' | 'github' | 'hackernews' | 'all' | undefined) ?? 'all',
        })
        output = formatTrending(topics)
        break
      }

      case 'news': {
        const items = await getNews(
          call.args.query as string,
          (call.args.maxItems as number | undefined) ?? 5,
        )
        output = formatNews(items)
        break
      }

      default:
        throw new Error(`Unknown tool: ${call.tool}`)
    }

    return { tool: call.tool, args: call.args, output }
  } catch (err) {
    return {
      tool: call.tool,
      args: call.args,
      output: '',
      error: (err as Error).message,
    }
  }
}

/** Execute multiple tool calls in parallel */
export async function executeTools(calls: ToolCall[]): Promise<ToolResult[]> {
  return Promise.all(calls.map(executeTool))
}
