import { mkdir, readdir, unlink, stat } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"
import type {
  TranscriptMetadata,
  TranscriptIndex,
  Transcript,
  TranscriptChunk,
} from "./types"
import { log } from "./logger"

const TRANSCRIPT_DIR = join(homedir(), ".local", "share", "opencode", "transcripts")
const INDEX_FILE = "index.json"
const RETENTION_DAYS = 7
const INDEX_VERSION = 1

export async function ensureTranscriptDir(): Promise<string> {
  await mkdir(TRANSCRIPT_DIR, { recursive: true })
  return TRANSCRIPT_DIR
}

export async function getSessionDir(sessionID: string): Promise<string> {
  const dir = join(TRANSCRIPT_DIR, sessionID)
  await mkdir(dir, { recursive: true })
  return dir
}

export async function readIndex(): Promise<TranscriptIndex> {
  await ensureTranscriptDir()
  const indexPath = join(TRANSCRIPT_DIR, INDEX_FILE)
  try {
    const content = await Bun.file(indexPath).json()
    return content as TranscriptIndex
  } catch {
    return { version: INDEX_VERSION, transcripts: {} }
  }
}

export async function writeIndex(index: TranscriptIndex): Promise<void> {
  await ensureTranscriptDir()
  const indexPath = join(TRANSCRIPT_DIR, INDEX_FILE)
  await Bun.write(indexPath, JSON.stringify(index, null, 2))
}

export async function updateIndexEntry(metadata: TranscriptMetadata): Promise<void> {
  const index = await readIndex()
  index.transcripts[metadata.sessionID] = metadata
  await writeIndex(index)
}

export async function removeIndexEntry(sessionID: string): Promise<void> {
  const index = await readIndex()
  delete index.transcripts[sessionID]
  await writeIndex(index)
}

export async function saveTranscript(transcript: Transcript): Promise<string> {
  const sessionDir = await getSessionDir(transcript.metadata.sessionID)

  // Save metadata
  await Bun.write(
    join(sessionDir, "metadata.json"),
    JSON.stringify(transcript.metadata, null, 2)
  )

  // Save markdown version
  await Bun.write(join(sessionDir, "transcript.md"), transcript.markdown)

  // Save text version
  await Bun.write(join(sessionDir, "transcript.txt"), transcript.text)

  // Save chunks for search
  const chunksDir = join(sessionDir, "chunks")
  await mkdir(chunksDir, { recursive: true })
  
  for (const chunk of transcript.chunks) {
    await Bun.write(
      join(chunksDir, `${chunk.id}.json`),
      JSON.stringify(chunk, null, 2)
    )
  }

  // Update index
  await updateIndexEntry(transcript.metadata)

  return join(sessionDir, "transcript.md")
}

export async function loadTranscript(sessionID: string): Promise<Transcript | null> {
  try {
    const sessionDir = join(TRANSCRIPT_DIR, sessionID)

    const metadata = await Bun.file(join(sessionDir, "metadata.json")).json() as TranscriptMetadata
    const markdown = await Bun.file(join(sessionDir, "transcript.md")).text()
    const text = await Bun.file(join(sessionDir, "transcript.txt")).text()

    // Load chunks
    const chunksDir = join(sessionDir, "chunks")
    const chunks: TranscriptChunk[] = []
    
    try {
      const chunkFiles = await readdir(chunksDir)
      for (const file of chunkFiles) {
        if (file.endsWith(".json")) {
          const chunk = await Bun.file(join(chunksDir, file)).json() as TranscriptChunk
          chunks.push(chunk)
        }
      }
      // Sort chunks by timestamp
      chunks.sort((a, b) => a.timestamp - b.timestamp)
    } catch {
      // No chunks directory
    }

    return { metadata, markdown, text, chunks }
  } catch {
    return null
  }
}

export async function loadTranscriptMarkdown(sessionID: string): Promise<string | null> {
  try {
    const sessionDir = join(TRANSCRIPT_DIR, sessionID)
    return await Bun.file(join(sessionDir, "transcript.md")).text()
  } catch {
    return null
  }
}

export async function loadTranscriptText(sessionID: string): Promise<string | null> {
  try {
    const sessionDir = join(TRANSCRIPT_DIR, sessionID)
    return await Bun.file(join(sessionDir, "transcript.txt")).text()
  } catch {
    return null
  }
}

export async function listTranscripts(options?: {
  projectID?: string
  sessionID?: string
  limit?: number
}): Promise<TranscriptMetadata[]> {
  const index = await readIndex()
  let transcripts = Object.values(index.transcripts)

  // Filter by project if specified
  if (options?.projectID) {
    transcripts = transcripts.filter((t) => t.projectID === options.projectID)
  }

  // Filter by session if specified (for current session history)
  if (options?.sessionID) {
    transcripts = transcripts.filter((t) => t.sessionID === options.sessionID)
  }

  // Sort by updatedAt descending (most recent first)
  transcripts.sort((a, b) => b.updatedAt - a.updatedAt)

  // Apply limit
  if (options?.limit) {
    transcripts = transcripts.slice(0, options.limit)
  }

  return transcripts
}

export async function deleteTranscript(sessionID: string): Promise<void> {
  try {
    const sessionDir = join(TRANSCRIPT_DIR, sessionID)
    
    // Remove all files in the session directory
    const files = await readdir(sessionDir, { recursive: true })
    for (const file of files) {
      const filePath = join(sessionDir, file)
      const fileStat = await stat(filePath)
      if (fileStat.isFile()) {
        await unlink(filePath)
      }
    }

    // Remove chunks directory
    try {
      const chunksDir = join(sessionDir, "chunks")
      const chunkFiles = await readdir(chunksDir)
      for (const file of chunkFiles) {
        await unlink(join(chunksDir, file))
      }
      await Bun.$`rmdir ${chunksDir}`.quiet().nothrow()
    } catch {
      // No chunks dir
    }

    // Remove session directory
    await Bun.$`rmdir ${sessionDir}`.quiet().nothrow()

    // Remove from index
    await removeIndexEntry(sessionID)
  } catch (error) {
    log.error("Failed to delete transcript", { sessionID, error: String(error) })
  }
}

export async function cleanupExpiredTranscripts(): Promise<number> {
  const index = await readIndex()
  const now = Date.now()
  let deletedCount = 0

  for (const [sessionID, metadata] of Object.entries(index.transcripts)) {
    if (metadata.expiresAt && metadata.expiresAt < now) {
      await deleteTranscript(sessionID)
      deletedCount++
    }
  }

  return deletedCount
}

export function calculateExpiresAt(retentionDays: number = RETENTION_DAYS): number {
  return Date.now() + retentionDays * 24 * 60 * 60 * 1000
}

export function getTranscriptPath(sessionID: string): string {
  return join(TRANSCRIPT_DIR, sessionID, "transcript.md")
}
