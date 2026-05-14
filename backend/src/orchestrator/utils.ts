/**
 * Robustly extract the first JSON object from LLM output.
 * Handles:
 *   - Bare JSON: { ... }
 *   - Markdown code block: ```json\n{ ... }\n```
 *   - Mixed text before/after the JSON
 */
export function extractJson<T = unknown>(raw: string): T | null {
  if (!raw) return null

  // 1. Try to strip markdown code fences first
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T
    } catch {
      // Fall through
    }
  }

  // 2. Find the outermost { ... } (handles nested braces)
  const start = raw.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let end = -1
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === '{') depth++
    else if (raw[i] === '}') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }

  if (end === -1) return null

  try {
    return JSON.parse(raw.slice(start, end + 1)) as T
  } catch {
    return null
  }
}
