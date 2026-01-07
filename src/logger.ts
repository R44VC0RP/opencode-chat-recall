import { appendFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"

const LOG_DIR = join(homedir(), ".local", "share", "opencode", "log")
const LOG_FILE = "chat-recall.log"
const MAX_LOG_SIZE = 5 * 1024 * 1024 // 5MB

let logPath: string | null = null
let initialized = false

async function ensureLogDir(): Promise<string> {
  if (!logPath) {
    await mkdir(LOG_DIR, { recursive: true })
    logPath = join(LOG_DIR, LOG_FILE)
  }
  return logPath
}

function formatMessage(level: string, message: string, data?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString()
  const dataStr = data ? ` ${JSON.stringify(data)}` : ""
  return `[${timestamp}] [${level}] [chat-recall] ${message}${dataStr}\n`
}

async function writeLog(level: string, message: string, data?: Record<string, unknown>): Promise<void> {
  try {
    const path = await ensureLogDir()
    const formatted = formatMessage(level, message, data)
    await appendFile(path, formatted)
  } catch {
    // Silently fail - we don't want logging to break the plugin
  }
}

export const log = {
  debug(message: string, data?: Record<string, unknown>): void {
    // Fire and forget - don't await
    writeLog("DEBUG", message, data)
  },

  info(message: string, data?: Record<string, unknown>): void {
    writeLog("INFO", message, data)
  },

  warn(message: string, data?: Record<string, unknown>): void {
    writeLog("WARN", message, data)
  },

  error(message: string, data?: Record<string, unknown>): void {
    writeLog("ERROR", message, data)
  },
}
