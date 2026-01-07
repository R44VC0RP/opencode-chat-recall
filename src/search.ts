import type { TranscriptChunk, SearchResult, TranscriptMetadata } from "./types"
import { loadTranscript, listTranscripts, readIndex } from "./storage"

interface SearchOptions {
  query: string
  sessionID?: string
  projectID?: string
  limit?: number
  includeContext?: boolean
}

/**
 * Simple text search across transcript chunks
 * Returns matching results with context
 */
export async function searchTranscripts(options: SearchOptions): Promise<SearchResult[]> {
  const { query, sessionID, projectID, limit = 10, includeContext = true } = options
  const results: SearchResult[] = []

  // Get list of transcripts to search
  const transcripts = await listTranscripts({ projectID, sessionID })

  // Build search terms (case-insensitive)
  const searchTerms = query.toLowerCase().split(/\s+/).filter(Boolean)

  for (const metadata of transcripts) {
    const transcript = await loadTranscript(metadata.sessionID)
    if (!transcript) continue

    for (let i = 0; i < transcript.chunks.length; i++) {
      const chunk = transcript.chunks[i]!
      const contentLower = chunk.content.toLowerCase()

      // Check if all search terms are present
      const matches = searchTerms.every((term) => contentLower.includes(term))
      if (!matches) continue

      // Calculate simple relevance score based on term frequency
      let score = 0
      for (const term of searchTerms) {
        const regex = new RegExp(term, "gi")
        const matchCount = (chunk.content.match(regex) || []).length
        score += matchCount
      }

      // Get context (previous and next chunks)
      let context: { before?: string; after?: string } = {}
      if (includeContext) {
        const prevChunk = transcript.chunks[i - 1]
        const nextChunk = transcript.chunks[i + 1]
        if (prevChunk) {
          context.before = truncateText(prevChunk.content, 200)
        }
        if (nextChunk) {
          context.after = truncateText(nextChunk.content, 200)
        }
      }

      // Create excerpt with highlighted terms
      const excerpt = createExcerpt(chunk.content, searchTerms, 500)

      results.push({
        sessionID: metadata.sessionID,
        sessionTitle: metadata.title,
        messageID: chunk.messageID,
        role: chunk.role,
        excerpt,
        timestamp: chunk.timestamp,
        score,
        context,
      })
    }
  }

  // Sort by score (highest first)
  results.sort((a, b) => b.score - a.score)

  // Apply limit
  return results.slice(0, limit)
}

/**
 * Search within a specific session
 */
export async function searchInSession(
  sessionID: string,
  query: string,
  limit: number = 10
): Promise<SearchResult[]> {
  return searchTranscripts({
    query,
    sessionID,
    limit,
    includeContext: true,
  })
}

/**
 * Search across all sessions in a project
 */
export async function searchInProject(
  projectID: string,
  query: string,
  limit: number = 10
): Promise<SearchResult[]> {
  return searchTranscripts({
    query,
    projectID,
    limit,
    includeContext: true,
  })
}

/**
 * Search across all sessions (all projects)
 */
export async function searchAll(
  query: string,
  limit: number = 10
): Promise<SearchResult[]> {
  return searchTranscripts({
    query,
    limit,
    includeContext: true,
  })
}

/**
 * Create an excerpt from content with search terms
 */
function createExcerpt(content: string, terms: string[], maxLength: number): string {
  // Find the first occurrence of any term
  const contentLower = content.toLowerCase()
  let bestIndex = content.length
  
  for (const term of terms) {
    const index = contentLower.indexOf(term)
    if (index !== -1 && index < bestIndex) {
      bestIndex = index
    }
  }

  // If no match found, return beginning of content
  if (bestIndex === content.length) {
    return truncateText(content, maxLength)
  }

  // Calculate start position (center the match)
  const halfLength = Math.floor(maxLength / 2)
  let start = Math.max(0, bestIndex - halfLength)
  let end = Math.min(content.length, start + maxLength)

  // Adjust start if we're at the end
  if (end === content.length && end - start < maxLength) {
    start = Math.max(0, end - maxLength)
  }

  let excerpt = content.slice(start, end)

  // Add ellipsis if truncated
  if (start > 0) {
    excerpt = "..." + excerpt
  }
  if (end < content.length) {
    excerpt = excerpt + "..."
  }

  return excerpt
}

/**
 * Truncate text to a maximum length
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }
  return text.slice(0, maxLength - 3) + "..."
}

/**
 * Get summary statistics for transcripts
 */
export async function getTranscriptStats(projectID?: string): Promise<{
  totalTranscripts: number
  totalMessages: number
  compactedCount: number
  oldestTimestamp: number
  newestTimestamp: number
}> {
  const index = await readIndex()
  let transcripts = Object.values(index.transcripts)

  if (projectID) {
    transcripts = transcripts.filter((t) => t.projectID === projectID)
  }

  const stats = {
    totalTranscripts: transcripts.length,
    totalMessages: transcripts.reduce((sum, t) => sum + t.messageCount, 0),
    compactedCount: transcripts.filter((t) => t.compacted).length,
    oldestTimestamp: Math.min(...transcripts.map((t) => t.createdAt), Date.now()),
    newestTimestamp: Math.max(...transcripts.map((t) => t.updatedAt), 0),
  }

  return stats
}
