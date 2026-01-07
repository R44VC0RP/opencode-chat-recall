import type { Message, Part, Session, Project } from "@opencode-ai/sdk"

export interface TranscriptMetadata {
  sessionID: string
  projectID: string
  title: string
  directory: string
  worktree: string
  createdAt: number
  updatedAt: number
  messageCount: number
  compacted: boolean
  compactedAt?: number
  expiresAt: number // For 7-day cleanup
}

export interface TranscriptIndex {
  version: number
  transcripts: Record<string, TranscriptMetadata>
}

export interface TranscriptChunk {
  id: string
  sessionID: string
  messageID: string
  role: "user" | "assistant"
  content: string
  timestamp: number
  partTypes: string[] // Types of parts in this chunk (text, tool, file, etc.)
}

export interface Transcript {
  metadata: TranscriptMetadata
  markdown: string
  text: string
  chunks: TranscriptChunk[]
}

export interface MessageWithParts {
  info: Message
  parts: Part[]
}

export interface SearchResult {
  sessionID: string
  sessionTitle: string
  messageID: string
  role: "user" | "assistant"
  excerpt: string
  timestamp: number
  score: number
  context: {
    before?: string
    after?: string
  }
}

export interface TranscriptListItem {
  sessionID: string
  title: string
  directory: string
  messageCount: number
  compacted: boolean
  createdAt: number
  updatedAt: number
}

export type TranscriptFormat = "markdown" | "text" | "both"
