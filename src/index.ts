import type { Plugin, PluginInput, Hooks } from "@opencode-ai/plugin"
import type { Event, Session, Message, Part } from "@opencode-ai/sdk"
import type { MessageWithParts } from "./types"
import { log } from "./logger"
// Tools are small and needed immediately for registration - import synchronously
import { tools } from "./tools"

// Heavy modules are lazy-loaded only when needed
let _buildTranscript: typeof import("./formatter").buildTranscript | null = null
let _saveTranscript: typeof import("./storage").saveTranscript | null = null
let _cleanupExpiredTranscripts: typeof import("./storage").cleanupExpiredTranscripts | null = null

async function getBuildTranscript() {
  if (!_buildTranscript) {
    const mod = await import("./formatter")
    _buildTranscript = mod.buildTranscript
  }
  return _buildTranscript
}

async function getSaveTranscript() {
  if (!_saveTranscript) {
    const mod = await import("./storage")
    _saveTranscript = mod.saveTranscript
  }
  return _saveTranscript
}

async function getCleanupExpiredTranscripts() {
  if (!_cleanupExpiredTranscripts) {
    const mod = await import("./storage")
    _cleanupExpiredTranscripts = mod.cleanupExpiredTranscripts
  }
  return _cleanupExpiredTranscripts
}

// Cleanup interval (run every hour)
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000

/**
 * OpenCode Chat Recall Plugin
 * 
 * This plugin provides tools for transcript recall after context compaction.
 * It saves conversation transcripts and allows searching through them.
 */
export const ChatRecallPlugin: Plugin = async (input: PluginInput): Promise<Hooks> => {
  const { client, project } = input
  
  // Ensure directory and worktree are strings (SDK may pass objects)
  const directory = typeof input.directory === 'string' ? input.directory : String(input.directory || '')
  const worktree = typeof input.worktree === 'string' ? input.worktree : String(input.worktree || '')

  log.info("Plugin initialized", { projectId: project.id, directory, worktree })

  // Defer cleanup to not block initialization
  let cleanupScheduled = false
  const scheduleCleanup = () => {
    if (cleanupScheduled) return
    cleanupScheduled = true
    
    // Run first cleanup after 30 seconds (don't block startup)
    setTimeout(async () => {
      try {
        const cleanup = await getCleanupExpiredTranscripts()
        const deleted = await cleanup()
        if (deleted > 0) {
          log.info("Cleaned up expired transcripts", { count: deleted })
        }
      } catch (error) {
        log.error("Cleanup error", { error: String(error) })
      }
      
      // Then schedule periodic cleanup
      setInterval(async () => {
        try {
          const cleanup = await getCleanupExpiredTranscripts()
          const deleted = await cleanup()
          if (deleted > 0) {
            log.info("Cleaned up expired transcripts", { count: deleted })
          }
        } catch (error) {
          log.error("Cleanup error", { error: String(error) })
        }
      }, CLEANUP_INTERVAL_MS)
    }, 30_000)
  }

  /**
   * Helper to fetch all messages for a session
   */
  async function fetchSessionMessages(sessionID: string): Promise<MessageWithParts[]> {
    try {
      const response = await client.session.messages({ path: { id: sessionID } })
      // Check if data is an array, not just truthy (SDK may return {} instead of [])
      if (!response.data || !Array.isArray(response.data)) return []
      
      return response.data.map((item) => ({
        info: item.info as Message,
        parts: item.parts as Part[],
      }))
    } catch (error) {
      log.error("Failed to fetch messages", { sessionID, error: String(error) })
      return []
    }
  }

  /**
   * Helper to get session info
   */
  async function fetchSession(sessionID: string): Promise<Session | null> {
    try {
      const response = await client.session.get({ path: { id: sessionID } })
      return response.data as Session
    } catch (error) {
      log.error("Failed to fetch session", { sessionID, error: String(error) })
      return null
    }
  }

  /**
   * Save transcript for a session (lazy-loads dependencies)
   */
  async function saveSessionTranscript(
    sessionID: string,
    compacted: boolean = false
  ): Promise<string | null> {
    try {
      const session = await fetchSession(sessionID)
      if (!session) return null

      const messages = await fetchSessionMessages(sessionID)
      // Use Array.isArray for proper type checking (SDK may return {} instead of [])
      if (!Array.isArray(messages) || messages.length === 0) return null

      // Lazy load heavy modules
      const buildTranscript = await getBuildTranscript()
      const saveTranscript = await getSaveTranscript()

      const transcript = buildTranscript(
        messages,
        sessionID,
        project.id,
        session.title,
        directory,
        worktree,
        compacted
      )

      // Defensive check - ensure buildTranscript returned a valid object
      if (!transcript || !transcript.metadata) {
        log.error("buildTranscript returned invalid result", { sessionID, transcript: typeof transcript })
        return null
      }

      const path = await saveTranscript(transcript)
      log.info("Saved transcript", { sessionID, messageCount: messages.length, compacted })
      return path
    } catch (error) {
      log.error("Failed to save transcript", { sessionID, error: String(error) })
      return null
    }
  }

  return {
    /**
     * Custom tools for transcript recall
     */
    tool: tools,

    /**
     * Event handler for session events
     */
    event: async ({ event }: { event: Event }) => {
      // Schedule cleanup on first event (lazy initialization)
      scheduleCleanup()

      // Handle session.idle - save/update transcript
      if (event.type === "session.idle") {
        const sessionID = event.properties.sessionID
        await saveSessionTranscript(sessionID, false)
      }

      // Handle session.compacted - mark transcript as compacted
      if (event.type === "session.compacted") {
        const sessionID = event.properties.sessionID
        log.info("Session compacted, updating transcript", { sessionID })
        await saveSessionTranscript(sessionID, true)
      }
    },

    /**
     * Hook into compaction to inject transcript reference
     */
    "experimental.session.compacting": async (
      input: { sessionID: string },
      output: { context: string[]; prompt?: string }
    ) => {
      const { sessionID } = input

      // First, save the current transcript before compaction
      const transcriptPath = await saveSessionTranscript(sessionID, true)

      if (transcriptPath) {
        // Inject reference to the transcript in the compaction context
        output.context.push(`## IMPORTANT: Conversation History Available

The full transcript of this conversation (before this summary) has been saved. You have access to recall any details that may have been lost during summarization.

**Transcript location:** \`${transcriptPath}\`

### When to use transcript recall:
- You need exact file paths, URLs, or identifiers mentioned earlier
- You need to reference specific command outputs or error messages
- You need code snippets that were discussed or shown
- You need to recall specific decisions, requirements, or instructions from the user
- The user references something from "earlier" that isn't in your current context

### How to recall information:

1. **Search for specific information:**
   \`recall_transcript({ query: "the keywords you're looking for" })\`
   
2. **Get the full transcript:**
   \`recall_transcript({ sessionID: "${sessionID}", fullTranscript: true })\`

3. **List all available transcripts (including other sessions):**
   \`list_transcripts({ allSessions: true })\`

If the user asks about something you don't remember or need more details about, USE THESE TOOLS to search the conversation history rather than asking the user to repeat themselves.`)
      }
    },
  }
}

// Default export for plugin loading
export default ChatRecallPlugin

// Export types only - avoid exporting functions that might conflict with hook names
export type * from "./types"
