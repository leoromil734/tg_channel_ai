import { search, formatSearchResults, type SearchResult } from '../../tools/search.js'
import type { AIProvider } from '../../providers/types.js'

export interface ResearchResult {
  keywords: string[]
  searchResults: SearchResult[]
  summary: string
  formattedResults: string
}

export async function runResearcher(
  channelName: string,
  channelDescription: string,
  userIntro: string,
  queryTemplate: string,
  textProvider: AIProvider,
): Promise<ResearchResult> {
  const systemPrompt = `You are a research assistant. Given channel information, generate precise search keywords to find the latest relevant content for creating engaging posts.`

  const keywordPrompt = `Generate 3 search keywords/phrases for a Telegram channel:
Channel name: ${channelName}
Description: ${channelDescription}
User notes: ${userIntro}
${queryTemplate ? `Query template: ${queryTemplate}` : ''}

Return ONLY a JSON array of 3 strings, e.g.: ["keyword 1", "keyword 2", "keyword 3"]`

  const keywordsRaw = await textProvider.generateText(keywordPrompt, {
    systemPrompt,
    temperature: 0.5,
    maxTokens: 200,
  })

  let keywords: string[] = []
  try {
    const match = keywordsRaw.match(/\[.*\]/s)
    if (match) keywords = JSON.parse(match[0])
  } catch {
    keywords = [channelName, channelDescription.slice(0, 50)]
  }

  const allResults: SearchResult[] = []
  for (const kw of keywords.slice(0, 2)) {
    try {
      const results = await search(kw, { maxResults: 3 })
      allResults.push(...results)
    } catch (err) {
      console.warn(`Search failed for "${kw}":`, err)
    }
  }

  const formattedResults = formatSearchResults(allResults)

  const summaryPrompt = `Summarize the following search results in 3-5 key points relevant to "${channelName}":

${formattedResults}

Write a concise summary in the same language as the channel description.`

  let summary = ''
  if (allResults.length > 0) {
    summary = await textProvider.generateText(summaryPrompt, { temperature: 0.5, maxTokens: 400 })
  }

  return {
    keywords,
    searchResults: allResults,
    summary,
    formattedResults,
  }
}
