export interface WikiResult {
  title: string
  extract: string
  url: string
  thumbnail?: string
}

export async function wikipedia(topic: string, lang = 'zh'): Promise<WikiResult> {
  // First, search for the page title
  const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json&srlimit=1&origin=*`

  const searchRes = await fetch(searchUrl, {
    headers: { 'User-Agent': 'ChannelAI/1.0 (content research bot)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!searchRes.ok) throw new Error(`Wikipedia search failed: ${searchRes.status}`)

  const searchData = (await searchRes.json()) as {
    query?: { search?: Array<{ title: string }> }
  }

  const title = searchData.query?.search?.[0]?.title
  if (!title) throw new Error(`No Wikipedia article found for: ${topic}`)

  // Fetch the page extract
  const extractUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts|pageimages&exintro=true&explaintext=true&piprop=thumbnail&pithumbsize=400&format=json&origin=*`

  const extractRes = await fetch(extractUrl, {
    headers: { 'User-Agent': 'ChannelAI/1.0 (content research bot)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!extractRes.ok) throw new Error(`Wikipedia extract failed: ${extractRes.status}`)

  const extractData = (await extractRes.json()) as {
    query?: {
      pages?: Record<string, {
        title: string
        extract?: string
        thumbnail?: { source: string }
      }>
    }
  }

  const pages = extractData.query?.pages ?? {}
  const page = Object.values(pages)[0]
  if (!page) throw new Error('Wikipedia page not found')

  return {
    title: page.title,
    extract: (page.extract ?? '').slice(0, 3000),
    url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
    thumbnail: page.thumbnail?.source,
  }
}
