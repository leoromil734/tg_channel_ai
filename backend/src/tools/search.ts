export interface SearchResult {
  title: string
  url: string
  content: string
  publishedDate?: string
}

export interface SearchOptions {
  maxResults?: number
}

// ─── Tavily (primary, structured) ────────────────────────────────────────────

async function tavilySearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) throw new Error('TAVILY_API_KEY not set')

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'advanced',
      max_results: options.maxResults ?? 5,
      include_answer: true,
    }),
  })
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${res.statusText}`)

  const data = (await res.json()) as {
    results?: Array<{ title: string; url: string; content: string; published_date?: string }>
  }
  return (data.results ?? []).map((r) => ({
    title: r.title, url: r.url, content: r.content, publishedDate: r.published_date,
  }))
}

// ─── DuckDuckGo Instant Answer API (free, no key) ────────────────────────────

async function duckduckgoSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChannelAI/1.0)' },
  })
  if (!res.ok) throw new Error(`DuckDuckGo ${res.status}`)

  const data = (await res.json()) as {
    AbstractText?: string
    AbstractURL?: string
    AbstractSource?: string
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>
  }

  const results: SearchResult[] = []

  if (data.AbstractText && data.AbstractURL) {
    results.push({ title: data.AbstractSource ?? query, url: data.AbstractURL, content: data.AbstractText })
  }

  const related = (data.RelatedTopics ?? [])
    .filter((t) => t.Text && t.FirstURL)
    .slice(0, (options.maxResults ?? 5) - results.length)
    .map((t) => ({ title: t.Text!.split(' - ')[0] ?? '', url: t.FirstURL!, content: t.Text! }))

  return [...results, ...related].slice(0, options.maxResults ?? 5)
}

// ─── Bing (via fetch with browser UA, stealth headers) ────────────────────────

async function bingSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${options.maxResults ?? 5}`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
    },
  })
  if (!res.ok) throw new Error(`Bing ${res.status}`)

  const html = await res.text()
  const results: SearchResult[] = []

  // Extract result snippets from raw HTML
  const blockRegex = /<li class="b_algo"[\s\S]*?(?=<li class="b_algo"|$)/g
  const blocks = html.match(blockRegex) ?? []

  for (const block of blocks.slice(0, options.maxResults ?? 5)) {
    const titleMatch = block.match(/<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
    const snippetMatch = block.match(/<p[^>]*class="[^"]*b_algoSlug[^"]*"[^>]*>([\s\S]*?)<\/p>/i) ??
      block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)

    if (titleMatch) {
      results.push({
        title: stripTags(titleMatch[2]),
        url: titleMatch[1],
        content: snippetMatch ? stripTags(snippetMatch[1]) : '',
      })
    }
  }

  return results
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim()
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
  // Priority: Tavily → DuckDuckGo → Bing
  if (process.env.TAVILY_API_KEY) {
    return tavilySearch(query, options)
  }
  try {
    const results = await duckduckgoSearch(query, options)
    if (results.length > 0) return results
  } catch (err) {
    console.warn('[search] DuckDuckGo failed:', (err as Error).message)
  }
  return bingSearch(query, options)
}

export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return 'No search results found.'
  return results
    .map((r, i) =>
      `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content}${r.publishedDate ? `\nDate: ${r.publishedDate}` : ''}`,
    )
    .join('\n\n---\n\n')
}
