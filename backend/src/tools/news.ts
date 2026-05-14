import { readRss, formatRssResults } from './rss.js'

export interface NewsItem {
  title: string
  url: string
  summary: string
  source: string
  pubDate?: string
}

/**
 * NewsAPI.org — free tier: 100 req/day
 * Set NEWS_API_KEY env to enable
 */
async function newsApi(query: string, maxItems = 5): Promise<NewsItem[]> {
  const apiKey = process.env.NEWS_API_KEY
  if (!apiKey) throw new Error('NEWS_API_KEY not set')

  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&pageSize=${maxItems}&sortBy=publishedAt&language=zh&apiKey=${apiKey}`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`NewsAPI ${res.status}`)

  const data = (await res.json()) as {
    articles?: Array<{
      title: string
      url: string
      description: string | null
      source: { name: string }
      publishedAt: string
    }>
  }

  return (data.articles ?? []).map((a) => ({
    title: a.title,
    url: a.url,
    summary: a.description ?? '',
    source: a.source.name,
    pubDate: a.publishedAt,
  }))
}

/**
 * Aggregates news from multiple free RSS sources based on topic keywords.
 */
async function rssAggregator(topic: string, maxItems = 6): Promise<NewsItem[]> {
  const TOPIC_FEEDS: Record<string, string[]> = {
    default: ['https://feeds.bbci.co.uk/news/world/rss.xml', 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml'],
    tech: ['https://techcrunch.com/feed/', 'https://feeds.feedburner.com/TheHackersNews', 'https://www.wired.com/feed/rss'],
    ai: ['https://www.artificialintelligence-news.com/feed/', 'https://venturebeat.com/category/ai/feed/'],
    crypto: ['https://cointelegraph.com/rss', 'https://decrypt.co/feed'],
    finance: ['https://feeds.bloomberg.com/markets/news.rss'],
    cn: ['https://rsshub.app/zaobao/realtime/china', 'https://rsshub.app/36kr/news/technology'],
  }

  // Match topic to category
  let feedUrls = TOPIC_FEEDS.default
  const lowerTopic = topic.toLowerCase()
  if (/ai|人工智能|machine learning|llm|chatgpt/.test(lowerTopic)) feedUrls = TOPIC_FEEDS.ai
  else if (/tech|技术|科技|编程|software|dev/.test(lowerTopic)) feedUrls = TOPIC_FEEDS.tech
  else if (/crypto|比特币|以太坊|blockchain|web3/.test(lowerTopic)) feedUrls = TOPIC_FEEDS.crypto
  else if (/finance|金融|股市|invest|市场/.test(lowerTopic)) feedUrls = TOPIC_FEEDS.finance

  const results: NewsItem[] = []
  for (const feedUrl of feedUrls.slice(0, 2)) {
    try {
      const feed = await readRss(feedUrl, maxItems)
      for (const item of feed.items) {
        results.push({
          title: item.title,
          url: item.link,
          summary: item.description,
          source: feed.feedTitle,
          pubDate: item.pubDate,
        })
      }
    } catch (err) {
      console.warn(`[news] RSS failed for ${feedUrl}: ${(err as Error).message}`)
    }
    if (results.length >= maxItems) break
  }

  return results.slice(0, maxItems)
}

export async function getNews(query: string, maxItems = 5): Promise<NewsItem[]> {
  if (process.env.NEWS_API_KEY) {
    try {
      return await newsApi(query, maxItems)
    } catch (err) {
      console.warn('[news] NewsAPI failed, falling back to RSS:', (err as Error).message)
    }
  }
  return rssAggregator(query, maxItems)
}

export function formatNews(items: NewsItem[]): string {
  if (items.length === 0) return 'No news found.'
  return items
    .map((item, i) =>
      `[${i + 1}] ${item.title}\nSource: ${item.source}${item.pubDate ? ` | ${item.pubDate.slice(0, 10)}` : ''}\n${item.summary}`,
    )
    .join('\n\n---\n\n')
}
