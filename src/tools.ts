import { tool } from "@opencode-ai/plugin"
import {
  listTranscripts,
  loadTranscriptMarkdown,
  loadTranscriptText,
  loadTranscript,
  getTranscriptPath,
} from "./storage"
import { searchTranscripts, searchInSession, getTranscriptStats } from "./search"
import type { TranscriptFormat } from "./types"

/**
 * Tool to list available transcripts
 */
export const listTranscriptsTool = tool({
  description: `List saved conversation transcripts. Can filter by current session or show all sessions.

Use this to:
- See what conversation history is available for recall
- Find specific past conversations by title
- Check if a session has been compacted

Options:
- currentSession: Only show transcripts for the current session (default: false)
- allSessions: Show transcripts from all sessions/projects (default: false)
- limit: Maximum number of results (default: 20)`,
  args: {
    currentSession: tool.schema.boolean().optional().describe(
      "Only list transcripts for the current session (most recent)"
    ),
    allSessions: tool.schema.boolean().optional().describe(
      "Include transcripts from all sessions and projects"
    ),
    limit: tool.schema.number().optional().describe(
      "Maximum number of transcripts to return (default: 20)"
    ),
  },
  async execute(args, context) {
    const limit = args.limit ?? 20
    
    let transcripts
    if (args.currentSession) {
      // Only get transcripts for the current session
      transcripts = await listTranscripts({
        sessionID: context.sessionID,
        limit,
      })
    } else if (args.allSessions) {
      // Get all transcripts across all projects
      transcripts = await listTranscripts({ limit })
    } else {
      // Default: get transcripts for current project (we don't have projectID in context, so list all)
      transcripts = await listTranscripts({ limit })
    }

    if (transcripts.length === 0) {
      return "No transcripts found. Transcripts are saved when sessions become idle or are compacted."
    }

    const lines: string[] = []
    lines.push(`Found ${transcripts.length} transcript(s):\n`)

    for (const t of transcripts) {
      const createdDate = new Date(t.createdAt).toLocaleString()
      const compactedStatus = t.compacted ? " [COMPACTED]" : ""
      const isCurrentSession = t.sessionID === context.sessionID ? " (current)" : ""
      
      lines.push(`- **${t.title}**${isCurrentSession}${compactedStatus}`)
      lines.push(`  Session: ${t.sessionID}`)
      lines.push(`  Messages: ${t.messageCount}`)
      lines.push(`  Created: ${createdDate}`)
      lines.push(`  Path: ${getTranscriptPath(t.sessionID)}`)
      lines.push("")
    }

    return lines.join("\n")
  },
})

/**
 * Tool to recall/search conversation history
 */
export const recallTranscriptTool = tool({
  description: `Search through saved conversation transcripts to recall specific information.

Use this when you need to:
- Find details that may have been lost during context compaction
- Search for specific file paths, code snippets, or commands mentioned earlier
- Recall decisions or explanations from previous parts of the conversation

The search looks through all message content including tool outputs.

Format options:
- markdown: Rich formatted output with code blocks and structure (best for reading)
- text: Plain text output (more compact)
- both: Returns both formats`,
  args: {
    query: tool.schema.string().describe(
      "Search query - keywords or phrases to find in conversation history"
    ),
    sessionID: tool.schema.string().optional().describe(
      "Specific session ID to search (omit to search all available transcripts)"
    ),
    format: tool.schema.enum(["markdown", "text", "both"]).optional().describe(
      "Output format: 'markdown' (default), 'text', or 'both'"
    ),
    limit: tool.schema.number().optional().describe(
      "Maximum number of results (default: 5)"
    ),
    fullTranscript: tool.schema.boolean().optional().describe(
      "If true, return the full transcript instead of search results"
    ),
  },
  async execute(args, context) {
    const format: TranscriptFormat = args.format ?? "markdown"
    const limit = args.limit ?? 5
    const sessionID = args.sessionID

    // If requesting full transcript
    if (args.fullTranscript) {
      const targetSession = sessionID ?? context.sessionID
      const transcript = await loadTranscript(targetSession)
      
      if (!transcript) {
        return `No transcript found for session ${targetSession}`
      }

      if (format === "both") {
        return `## Markdown Format\n\n${transcript.markdown}\n\n---\n\n## Text Format\n\n${transcript.text}`
      } else if (format === "text") {
        return transcript.text
      } else {
        return transcript.markdown
      }
    }

    // Search transcripts
    const results = sessionID
      ? await searchInSession(sessionID, args.query, limit)
      : await searchTranscripts({
          query: args.query,
          limit,
          includeContext: true,
        })

    if (results.length === 0) {
      return `No results found for query: "${args.query}"\n\nTry different keywords or check available transcripts with list_transcripts.`
    }

    const lines: string[] = []
    lines.push(`Found ${results.length} result(s) for "${args.query}":\n`)

    for (const result of results) {
      const date = new Date(result.timestamp).toLocaleString()
      const isCurrentSession = result.sessionID === context.sessionID ? " (current session)" : ""

      lines.push(`### ${result.sessionTitle}${isCurrentSession}`)
      lines.push(`**Role:** ${result.role} | **Time:** ${date}`)
      lines.push(`**Session:** ${result.sessionID}`)
      lines.push("")

      if (result.context.before) {
        lines.push(`*Before:* ${result.context.before}`)
        lines.push("")
      }

      lines.push("**Match:**")
      lines.push("```")
      lines.push(result.excerpt)
      lines.push("```")

      if (result.context.after) {
        lines.push("")
        lines.push(`*After:* ${result.context.after}`)
      }

      lines.push("")
      lines.push("---")
      lines.push("")
    }

    // Add hint about full transcript
    if (results.length > 0) {
      lines.push(`\n*Tip: Use \`fullTranscript: true\` with a sessionID to get the complete conversation.*`)
    }

    return lines.join("\n")
  },
})

/**
 * Export all tools
 */
export const tools = {
  list_transcripts: listTranscriptsTool,
  recall_transcript: recallTranscriptTool,
}
