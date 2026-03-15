# Pi Session JSONL Schema

## File Location

Session files are stored at: `~/.pi/agent/sessions/{workspace-slug}/{timestamp}_{uuid}.jsonl`

Workspace slugs use double-dashes for path separators:
- `--Users-jhsu-tpcw-build--` → `/Users/jhsu/tpcw-build`

## Entry Types

Each line is a JSON object with a `type` field:

### `session` (First Entry)
```json
{
  "type": "session",
  "version": 3,
  "id": "uuid",
  "timestamp": "ISO-8601",
  "cwd": "/path/to/project"
}
```

### `message`
```json
{
  "type": "message",
  "id": "short-hex",
  "parentId": "short-hex",
  "timestamp": "ISO-8601",
  "message": {
    "role": "user|assistant|toolResult",
    "content": "...",
    "toolCallId": "...",
    "toolName": "..."
  }
}
```

**Roles:**
- `user` — Human input, highest signal for decisions/directives
- `assistant` — AI response, contains recommendations, rationale, analysis
- `toolResult` — Tool output (bash, read, write, edit, mcp, etc.), mostly noise but errors/pivots are signal

### `compaction`
```json
{
  "type": "compaction",
  "id": "short-hex",
  "parentId": "short-hex",
  "timestamp": "ISO-8601",
  "summary": "## Structured summary markdown...",
  "firstKeptEntryId": "short-hex"
}
```

**Key:** Compaction summaries are pre-filtered highlights — high-value for extraction.

**Default summary sections:** `## Goal`, `## Progress`, `## Key Decisions`, `## Next Steps`, `## Critical Context`

**Enhanced summary sections** (with session-scanner-compaction extension): Also includes `## Lessons Learned`, `## Ideas & Proposals`, `## Action Items`, `## Patterns Observed`

### `custom_message` (vault-capture)

When the vault-capture extension is installed, `/vault-capture` commands create custom entries:
```json
{
  "type": "custom_message",
  "id": "short-hex",
  "parentId": "short-hex",
  "timestamp": "ISO-8601",
  "customType": "vault-capture",
  "content": "📌 Captured for vault: \"the text\"",
  "details": { "text": "the captured text", "timestamp": "ISO-8601" }
}
```

There are also `custom` entries (from `appendEntry`):
```json
{
  "type": "custom",
  "customType": "vault-capture",
  "data": { "text": "the captured text", "timestamp": "ISO-8601" }
}
```

**Scan for both:** `custom_message` with `customType: "vault-capture"` (message) and `custom` with `customType: "vault-capture"` (persisted entry). The `data.text` or `details.text` field contains the raw captured content.

### `session_info`
```json
{
  "type": "session_info",
  "id": "short-hex",
  "parentId": "short-hex",
  "timestamp": "ISO-8601",
  "name": "session-name"
}
```

### `model_change`
```json
{
  "type": "model_change",
  "id": "short-hex",
  "timestamp": "ISO-8601",
  "provider": "anthropic",
  "model": "model-name"
}
```

### `thinking_level_change`
```json
{
  "type": "thinking_level_change",
  "id": "short-hex",
  "timestamp": "ISO-8601",
  "thinkingLevel": "high|medium|low|none"
}
```

### `custom_message`
Extension-generated entries. May contain structured data from pi extensions.

## Parsing Strategy

### For Knowledge Extraction

1. **Read `session` entry** — get session metadata (id, timestamp, project cwd)
2. **Check for `compaction` entries** — extract from summaries first (highest signal-to-noise)
3. **Scan `message` entries** — focus on `user` and `assistant` roles
4. **Skip metadata entries** — `model_change`, `thinking_level_change`, `session_info` are not knowledge-bearing
5. **Filter `toolResult` entries** — only examine if they contain errors or triggered pivots

### Message Content Extraction

Messages with `role: "assistant"` often have content as an array:
```json
{
  "content": [
    { "type": "text", "text": "..." },
    { "type": "tool_use", "id": "...", "name": "...", "input": {...} }
  ]
}
```

Or as a simple string. Handle both formats.

### Content as Array (tool calls)
Tool use entries in assistant messages are generally noise. Focus on `text` blocks.

### Conversation Flow
Messages form a linked list via `parentId`. Follow the chain to reconstruct conversation flow when context is needed for an extraction.
