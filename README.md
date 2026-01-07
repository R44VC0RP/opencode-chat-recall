# opencode-chat-recall

An OpenCode plugin that provides transcript recall capabilities after context compaction. When your conversation gets too long and OpenCode summarizes it, this plugin saves the full transcript and gives the agent tools to search through it later.

## Installation

### From npm (recommended)

```bash
# Add to your opencode.json
{
  "plugin": ["opencode-chat-recall"]
}
```

### From source (development)

```bash
git clone https://github.com/R44VC0RP/opencode-chat-recall
cd opencode-chat-recall
bun install
```

Then add to your project's `.opencode/plugin/` directory:

```typescript
// .opencode/plugin/chat-recall.ts
export { default } from "opencode-chat-recall"
```

## How It Works

1. **Automatic Saving**: The plugin listens for `session.idle` events and saves transcripts automatically after each conversation turn.

2. **Compaction Integration**: When OpenCode compacts/summarizes a long conversation, the plugin:
   - Saves the full transcript before compaction
   - Injects instructions into the summary telling the agent how to recall details

3. **Search Tools**: Two tools are provided for the agent to use:
   - `list_transcripts` - List available saved transcripts
   - `recall_transcript` - Search through conversation history

## Tools

### `list_transcripts`

Lists saved conversation transcripts with filtering options.

**Parameters:**
- `currentSession` (boolean, optional) - Only show transcript for current session
- `allSessions` (boolean, optional) - Show transcripts from all sessions/projects  
- `limit` (number, optional) - Maximum results (default: 20)

**Example usage by agent:**
```
list_transcripts({ allSessions: true, limit: 10 })
```

### `recall_transcript`

Search through saved transcripts to find specific information.

**Parameters:**
- `query` (string, required) - Keywords to search for
- `sessionID` (string, optional) - Search specific session only
- `format` (string, optional) - Output format: "markdown", "text", or "both"
- `limit` (number, optional) - Maximum results (default: 5)
- `fullTranscript` (boolean, optional) - Return entire transcript instead of search results

**Example usage by agent:**
```
recall_transcript({ query: "S3 bucket upload path" })
recall_transcript({ query: "database schema", limit: 10 })
recall_transcript({ sessionID: "ses_xxx", fullTranscript: true })
```

## Storage Location

Transcripts are saved to:
```
~/.local/share/opencode/transcripts/
├── index.json                    # Global index of all transcripts
└── {sessionID}/
    ├── metadata.json             # Session metadata
    ├── transcript.md             # Full markdown transcript
    ├── transcript.txt            # Plain text version
    └── chunks/                   # Searchable chunks for fast search
        └── chunk_*.json
```

## Logging

Logs are written to `~/.local/share/opencode/log/chat-recall.log` (no console output).

## Auto-Cleanup

Transcripts are automatically deleted after 7 days to save disk space.

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Type check
bun run typecheck

# Build for publishing
bun run build
```

## License

MIT
