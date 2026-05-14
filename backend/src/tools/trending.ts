export interface TrendingTopic {
  keyword: string
  traffic?: string
  source: string
}

/**
 * Google Trends Daily Trending Searches RSS
 * Returns current trending searches for a given geo (default: CN)
 */
async function googleTrends(geo = 'CN'): Promise<TrendingTopic[]> {
  const url = `https://trends.google.com/trends/trendingsearches/daily/rss?geo=${geo}`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ChannelAI/1.0)',
      'Accept': 'application/rss+xml, application/xml',
    },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Google Trends ${res.status}`)

  const xml = await res.text()
  const itemRegex = /<item>[\s\S]*?<\/item>/gi
  const items = xml.match(itemRegex) ?? []

  return items.slice(0, 10).map((item) => {
    const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ?? item.match(/<title>(.*?)<\/title>/)
    const trafficMatch = item.match(/<ht:approx_traffic>(.*?)<\/ht:approx_traffic>/)
    return {
      keyword: titleMatch?.[1]?.trim() ?? '',
      traffic: trafficMatch?.[1]?.trim(),
      source: 'google_trends',
    }
  }).filter((t) => t.keyword)
}

/**
 * GitHub Trending (useful for tech channels)
 */
async function githubTrending(language = ''): Promise<TrendingTopic[]> {
  const url = `https://github.com/trending${language ? `/${language}` : ''}?since=daily`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html',
    },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`GitHub Trending ${res.status}`)

  const html = await res.text()

  // Parse repo names from h2 tags
  const repoRegex = /<h2[^>]*class="[^"]*h3[^"]*"[^>]*>[\s\S]*?<a[^>]*href="\/([^"]+)"[\s\S]*?<\/h2>/g
  const topics: TrendingTopic[] = []
  let m: RegExpExecArray | null

  while ((m = repoRegex.exec(html)) !== null && topics.length < 10) {
    topics.push({ keyword: m[1], source: 'github_trending' })
  }

  return topics
}

/**
 * Hacker News top stories (great for tech/startup content)
 */
async function hackerNewsTrending(limit = 10): Promise<TrendingTopic[]> {
  const res = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', {
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`HN API ${res.status}`)

  const ids = (await res.json()) as number[]
  const topIds = ids.slice(0, limit)

  const items = await Promise.allSettled(
    topIds.map((id) =>
      fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
        .then((r) => r.json() as Promise<{ title: string; score: number; url?: string }>),
    ),
  )

  return items
    .filter((r): r is PromiseFulfilledResult<{ title: string; score: number }> => r.status === 'fulfilled')
    .map((r) => ({ keyword: r.value.title, traffic: `Score: ${r.value.score}`, source: 'hackernews' }))
}

export async function getTrending(options: {
  geo?: string
  type?: 'google' | 'github' | 'hackernews' | 'all'
  language?: string
} = {}): Promise<TrendingTopic[]> {
  const { geo = 'CN', type = 'all', language = '' } = options

  if (type === 'google') return googleTrends(geo).catch(() => [])
  if (type === 'github') return githubTrending(language).catch(() => [])
  if (type === 'hackernews') return hackerNewsTrending().catch(() => [])

  // type === 'all': try all sources, combine
  const [google, hn] = await Promise.allSettled([
    googleTrends(geo),
    hackerNewsTrending(5),
  ])

  return [
    ...(google.status === 'fulfilled' ? google.value : []),
    ...(hn.status === 'fulfilled' ? hn.value : []),
  ]
}

export function formatTrending(topics: TrendingTopic[]): string {
  if (topics.length === 0) return 'No trending topics found.'
  return topics
    .map((t, i) => `[${i + 1}] ${t.keyword}${t.traffic ? ` (${t.traffic})` : ''} [${t.source}]`)
    .join('\n')
}
