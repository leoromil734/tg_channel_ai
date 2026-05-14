export interface ScrapeResult {
  url: string
  title: string
  content: string
  publishedDate?: string
  byline?: string
}

/**
 * Jina AI Reader — converts any URL to clean markdown.
 * Handles JS-rendered pages, paywalls, and bot detection on their end.
 * Free tier: 200 req/day without key, higher with JINA_API_KEY.
 * Docs: https://jina.ai/reader/
 */
async function jinaReader(url: string): Promise<ScrapeResult> {
  const jinaUrl = `https://r.jina.ai/${url}`
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'X-With-Links-Summary': 'false',
    'X-With-Images-Summary': 'false',
  }

  const apiKey = process.env.JINA_API_KEY
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  const res = await fetch(jinaUrl, { headers })
  if (!res.ok) throw new Error(`Jina Reader ${res.status}: ${res.statusText}`)

  const json = (await res.json()) as {
    data?: {
      title?: string
      content?: string
      url?: string
      publishedTime?: string
      byline?: string
    }
    code?: number
  }

  const data = json.data ?? {}
  return {
    url: data.url ?? url,
    title: data.title ?? '',
    content: (data.content ?? '').slice(0, 6000),
    publishedDate: data.publishedTime,
    byline: data.byline,
  }
}

/**
 * Lightweight fallback using fetch + manual HTML stripping.
 * Works for simple static pages but will fail on JS-rendered sites.
 */
async function fetchAndStrip(url: string): Promise<ScrapeResult> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Fetch ${res.status}: ${url}`)

  const html = await res.text()
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? ''

  // Remove scripts, styles, nav, footer
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return { url, title, content: cleaned.slice(0, 6000) }
}

export async function scrape(url: string): Promise<ScrapeResult> {
  try {
    return await jinaReader(url)
  } catch (err) {
    console.warn(`[scrape] Jina failed for ${url}: ${(err as Error).message}, falling back to fetch`)
    return fetchAndStrip(url)
  }
}
