import type { Message, Part, TextPart, ToolPart, FilePart, ReasoningPart } from "@opencode-ai/sdk"
import type { MessageWithParts, TranscriptChunk, Transcript, TranscriptMetadata } from "./types"
import { calculateExpiresAt } from "./storage"

/**
 * Format messages into a markdown transcript
 */
export function formatMessagesToMarkdown(
  messages: MessageWithParts[],
  sessionTitle: string
): string {
  const lines: string[] = []

  // Defensive check - SDK may return {} instead of []
  if (!Array.isArray(messages)) {
    lines.push(`# ${sessionTitle}`)
    lines.push("")
    lines.push(`*No messages available*`)
    return lines.join("\n")
  }

  lines.push(`# ${sessionTitle}`)
  lines.push("")
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push(`Messages: ${messages.length}`)
  lines.push("")
  lines.push("---")
  lines.push("")

  for (const msg of messages) {
    const role = msg.info.role === "user" ? "User" : "Assistant"
    const timestamp = new Date(msg.info.time.created).toLocaleString()

    lines.push(`## ${role}`)
    lines.push(`*${timestamp}*`)
    lines.push("")

    for (const part of msg.parts) {
      const formatted = formatPartMarkdown(part)
      if (formatted) {
        lines.push(formatted)
        lines.push("")
      }
    }

    lines.push("---")
    lines.push("")
  }

  return lines.join("\n")
}

/**
 * Format messages into a plain text transcript (no markdown)
 */
export function formatMessagesToText(
  messages: MessageWithParts[],
  sessionTitle: string
): string {
  const lines: string[] = []

  // Defensive check - SDK may return {} instead of []
  if (!Array.isArray(messages)) {
    lines.push(`=== ${sessionTitle} ===`)
    lines.push("")
    lines.push(`No messages available`)
    return lines.join("\n")
  }

  lines.push(`=== ${sessionTitle} ===`)
  lines.push("")
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push(`Messages: ${messages.length}`)
  lines.push("")
  lines.push("=".repeat(50))
  lines.push("")

  for (const msg of messages) {
    const role = msg.info.role === "user" ? "USER" : "ASSISTANT"
    const timestamp = new Date(msg.info.time.created).toLocaleString()

    lines.push(`[${role}] ${timestamp}`)
    lines.push("-".repeat(30))

    for (const part of msg.parts) {
      const formatted = formatPartText(part)
      if (formatted) {
        lines.push(formatted)
        lines.push("")
      }
    }

    lines.push("=".repeat(50))
    lines.push("")
  }

  return lines.join("\n")
}

/**
 * Format a single part to markdown
 */
function formatPartMarkdown(part: Part): string | null {
  switch (part.type) {
    case "text":
      return (part as TextPart).text

    case "reasoning":
      const reasoning = part as ReasoningPart
      return `<details>\n<summary>Reasoning</summary>\n\n${reasoning.text}\n\n</details>`

    case "tool":
      return formatToolPartMarkdown(part as ToolPart)

    case "file":
      const file = part as FilePart
      return `**File:** ${file.filename || file.url}`

    case "step-start":
    case "step-finish":
    case "snapshot":
    case "patch":
      return null // Skip internal parts

    case "compaction":
      return `*[Context was compacted at this point]*`

    default:
      return null
  }
}

/**
 * Format a tool part to markdown
 */
function formatToolPartMarkdown(part: ToolPart): string {
  const lines: string[] = []

  lines.push(`### Tool: \`${part.tool}\``)

  if (part.state.status === "completed") {
    const input = JSON.stringify(part.state.input, null, 2)
    lines.push("")
    lines.push("<details>")
    lines.push(`<summary>Input</summary>`)
    lines.push("")
    lines.push("```json")
    lines.push(input)
    lines.push("```")
    lines.push("")
    lines.push("</details>")

    // Truncate very long outputs
    let output = part.state.output
    if (output.length > 5000) {
      output = output.slice(0, 5000) + "\n... [truncated]"
    }

    lines.push("")
    lines.push("<details>")
    lines.push(`<summary>Output (${part.state.title})</summary>`)
    lines.push("")
    lines.push("```")
    lines.push(output)
    lines.push("```")
    lines.push("")
    lines.push("</details>")
  } else if (part.state.status === "error") {
    lines.push("")
    lines.push(`**Error:** ${part.state.error}`)
  } else if (part.state.status === "running") {
    lines.push("")
    lines.push(`*Running: ${part.state.title || "..."}*`)
  }

  return lines.join("\n")
}

/**
 * Format a single part to plain text
 */
function formatPartText(part: Part): string | null {
  switch (part.type) {
    case "text":
      return (part as TextPart).text

    case "reasoning":
      const reasoning = part as ReasoningPart
      return `[REASONING]\n${reasoning.text}\n[/REASONING]`

    case "tool":
      return formatToolPartText(part as ToolPart)

    case "file":
      const file = part as FilePart
      return `[FILE: ${file.filename || file.url}]`

    case "compaction":
      return "[CONTEXT COMPACTED]"

    default:
      return null
  }
}

/**
 * Format a tool part to plain text
 */
function formatToolPartText(part: ToolPart): string {
  const lines: string[] = []

  lines.push(`[TOOL: ${part.tool}]`)

  if (part.state.status === "completed") {
    const input = JSON.stringify(part.state.input, null, 2)
    lines.push(`Input: ${input}`)

    // Truncate very long outputs
    let output = part.state.output
    if (output.length > 5000) {
      output = output.slice(0, 5000) + "\n... [truncated]"
    }
    lines.push(`Output (${part.state.title}): ${output}`)
  } else if (part.state.status === "error") {
    lines.push(`Error: ${part.state.error}`)
  }

  lines.push(`[/TOOL]`)

  return lines.join("\n")
}

/**
 * Create transcript chunks from messages for search
 */
export function createChunks(
  messages: MessageWithParts[],
  sessionID: string
): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = []
  
  // Defensive check - SDK may return {} instead of []
  if (!Array.isArray(messages)) {
    return chunks
  }
  
  let chunkIndex = 0

  for (const msg of messages) {
    const role = msg.info.role as "user" | "assistant"
    const partTypes: string[] = []
    const contentParts: string[] = []

    for (const part of msg.parts) {
      partTypes.push(part.type)

      if (part.type === "text") {
        contentParts.push((part as TextPart).text)
      } else if (part.type === "tool") {
        const toolPart = part as ToolPart
        contentParts.push(`Tool: ${toolPart.tool}`)
        contentParts.push(`Input: ${JSON.stringify(toolPart.state.input)}`)
        // Only include output for completed tools
        if (toolPart.state.status === "completed") {
          const output = toolPart.state.output.slice(0, 1000)
          contentParts.push(`Output: ${output}`)
        }
      } else if (part.type === "reasoning") {
        contentParts.push((part as ReasoningPart).text)
      }
    }

    if (contentParts.length > 0) {
      chunks.push({
        id: `chunk_${chunkIndex++}`,
        sessionID,
        messageID: msg.info.id,
        role,
        content: contentParts.join("\n"),
        timestamp: msg.info.time.created,
        partTypes: [...new Set(partTypes)],
      })
    }
  }

  return chunks
}

/**
 * Build a complete transcript from messages
 */
export function buildTranscript(
  messages: MessageWithParts[],
  sessionID: string,
  projectID: string,
  sessionTitle: string,
  directory: string,
  worktree: string,
  compacted: boolean = false
): Transcript {
  const now = Date.now()

  const metadata: TranscriptMetadata = {
    sessionID,
    projectID,
    title: sessionTitle,
    directory,
    worktree,
    createdAt: now,
    updatedAt: now,
    messageCount: messages.length,
    compacted,
    compactedAt: compacted ? now : undefined,
    expiresAt: calculateExpiresAt(),
  }

  const markdown = formatMessagesToMarkdown(messages, sessionTitle)
  const text = formatMessagesToText(messages, sessionTitle)
  const chunks = createChunks(messages, sessionID)

  return {
    metadata,
    markdown,
    text,
    chunks,
  }
}
