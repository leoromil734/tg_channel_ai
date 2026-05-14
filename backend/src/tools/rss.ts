export interface RssItem {
  title: string
  link: string
  description: string
  pubDate?: string
  author?: string
  category?: string[]
}

export interface RssResult {
  feedTitle: string
  feedUrl: string
  items: RssItem[]
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, '')
    .trim()
}

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i'))
    ?? xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return match ? decodeEntities(match[1]) : ''
}

function extractAll(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi')
  const results: string[] = []
  let m: RegExpExecArray | null
  while ((m = regex.exec(xml)) !== null) {
    results.push(decodeEntities(m[1] ?? m[2] ?? ''))
  }
  return results
}

export async function readRss(feedUrl: string, maxItems = 5): Promise<RssResult> {
  const res = await fetch(feedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ChannelAI RSS Reader/1.0)',
      'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml',
    },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status} ${feedUrl}`)

  const xml = await res.text()

  // Support both RSS 2.0 and Atom feeds
  const isAtom = xml.includes('<feed')
  const feedTitle = extractTag(xml, 'title')
  const itemTag = isAtom ? 'entry' : 'item'

  // Split into individual item blocks
  const itemRegex = new RegExp(`<${itemTag}[^>]*>[\\s\\S]*?<\\/${itemTag}>`, 'gi')
  const itemBlocks = xml.match(itemRegex) ?? []

  const items: RssItem[] = itemBlocks.slice(0, maxItems).map((block) => {
    const title = extractTag(block, 'title')
    const link = isAtom
      ? (block.match(/<link[^>]+href="([^"]+)"/) ?? [])[1] ?? extractTag(block, 'link')
      : extractTag(block, 'link')
    const description = extractTag(block, isAtom ? 'summary' : 'description')
      || extractTag(block, 'content')
    const pubDate = extractTag(block, isAtom ? 'updated' : 'pubDate')
      || extractTag(block, 'published')
    const author = extractTag(block, 'author') || extractTag(block, 'dc:creator')
    const categories = extractAll(block, 'category')

    return { title, link, description: description.slice(0, 800), pubDate, author, category: categories }
  })

  return { feedTitle, feedUrl, items }
}

export function formatRssResults(result: RssResult): string {
  if (result.items.length === 0) return `RSS "${result.feedTitle}" has no items.`
  return `**${result.feedTitle}**\n\n` + result.items
    .map((item, i) =>
      `[${i + 1}] ${item.title}\n${item.pubDate ? `Date: ${item.pubDate}\n` : ''}${item.description}`,
    )
    .join('\n\n---\n\n')
}

/** Curated RSS feeds by category */
export const RSS_PRESETS: Record<string, string[]> = {
  tech: [
    'https://feeds.feedburner.com/TheHackersNews',
    'https://techcrunch.com/feed/',
    'https://www.wired.com/feed/rss',
  ],
  ai: [
    'https://www.artificialintelligence-news.com/feed/',
    'https://openai.com/blog/rss.xml',
  ],
  finance: [
    'https://feeds.bloomberg.com/markets/news.rss',
    'https://rss.app/feeds/finance-top.xml',
  ],
  crypto: [
    'https://cointelegraph.com/rss',
    'https://decrypt.co/feed',
  ],
  general: [
    'https://feeds.bbci.co.uk/news/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
  ],
}
