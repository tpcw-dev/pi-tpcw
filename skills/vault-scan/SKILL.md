---
name: vault-scan
description: Extract knowledge from pi session history — decisions, lessons, todos, ideas, patterns — and feed structured extractions to vault-update. Two modes — JSONL (auto-detect pi session files) and Manual (freeform text input). Triggers on "scan sessions", "extract knowledge", "vault scan", "session scanner", "capture from sessions".
---

# Vault Scan — Session Knowledge Extractor

Extract knowledge objects from pi session history and feed them to vault-update for processing. You are the bridge between ephemeral conversations and persistent knowledge.

**Design Principle:** Pluggable input — works without any provider (manual input mode), enhanced with pi JSONL session files when available. Extraction is LLM-driven (you decide what's worth capturing), but output format is deterministic (structured extraction objects for vault-update).

**Data Files:** This skill references two companion data files in the same package:
- `data/extraction-patterns.md` — what to extract, priority rules, dedup hints
- `data/jsonl-schema.md` — pi session JSONL format, entry types, parsing strategy

## Inputs

| Field | Required | Source | Default |
|-------|----------|--------|---------|
| `input_mode` | Auto-detected | See Mode Detection below | `manual` |
| `project` | ✅ YES | Invocation context or ask | Required |
| `source_paths` | JSONL mode | Session file paths or directory | `[]` |
| `manual_input` | Manual mode | Raw text describing session activity | `""` |
| `date_filter` | Optional | Scan sessions from last N days | `7` |
| `project_filter` | Optional | Only extract for specific project | `null` (all) |
| `confidence_threshold` | Optional | Minimum confidence to include | `low` |
| `skip_proposals` | Optional | Bypass proposal routing in vault-update | `false` |
| `skip_commit` | Optional | Skip git commit (for batch) | `false` |

## Mode Detection

Determine input mode from invocation context:

**JSONL Mode** — Input contains path(s) to `.jsonl` session file(s) or a session directory
→ Set `input_mode: jsonl`

**Manual Mode** — Input contains freeform text, bullet points, or summary of session activity
→ Set `input_mode: manual`

**Ambiguous** — Cannot determine mode
→ Ask: *"Do you have pi session files to scan, or would you like to manually describe what happened in your session?"*

---

## Phase 1: Locate Sessions

Find and validate session sources. Do NOT parse or extract content yet.

### JSONL Mode

**1a. Resolve session directory**

If `source_paths` contains specific `.jsonl` file paths:
- Validate each file exists via `test -f`

If `source_paths` contains a directory:
- List all `.jsonl` files in that directory

If `source_paths` is empty — auto-detect:
- Determine workspace slug from current project cwd
- Slug format: `/Users/jhsu/tpcw-build` → `--Users-jhsu-tpcw-build--`
- Look in: `~/.pi/agent/sessions/{slug}/`
- List all `.jsonl` files

**1b. Apply date filter**

Parse timestamp from each filename format: `{YYYY-MM-DDTHH-MM-SS-mmmZ}_{uuid}.jsonl`
- Keep only files within the `date_filter` range (default: 7 days)
- Log: `"📅 Date filter: last {N} days — {kept}/{total} files in range"`

**1c. Validate files**

For each candidate file:
- Read the first line — it should have `type: "session"`
- Confirm it's valid JSONL with a session header
- If `project_filter` is set, check session's `cwd` matches
- Discard invalid files with warning

**1d. Check result**

If zero valid files remain → HALT:
> *"❌ No valid session files found. Checked: {directory}. Date filter: {N} days. Try expanding the date range or providing a specific path."*

### Manual Mode

**1a. Validate input**

Check that `manual_input` is non-empty and substantive. If empty, ask:
> *"Please describe what happened in your recent session(s). Include decisions made, problems solved, ideas discussed, and any action items."*

**1b. Identify project**

If `project` is not set, infer from cwd. If ambiguous, ask.

**1c. Generate synthetic session ID**

Format: `manual-{project}-{YYYY-MM-DD}`

### Source Manifest

Log a brief summary of validated sources (mode, file count or input length, filters applied).

---

## Phase 2: Parse Sessions

Read session sources and extract raw knowledge-bearing content. Load `data/extraction-patterns.md` for guidance on what to extract. Load `data/jsonl-schema.md` for JSONL file structure.

Do NOT classify or structure yet — extract raw content snippets only.

### JSONL Mode

For each session file in the source manifest:

**2a. Read session header**

Parse the first line (`type: "session"`) to get `session_id`, `timestamp`, `cwd`.

**2b. Scan for compaction entries** (HIGHEST SIGNAL)

Search for entries with `type: "compaction"`:
- Extract the `summary` field — pre-filtered high-value content
- Parse for structured sections: Key Decisions, Problems Solved, TODOs, Lessons Learned, Ideas & Proposals, Patterns Observed
- Each distinct item in a compaction summary → separate raw extraction
- Tag: `source: "compaction"`, `priority: "high"`

**2c. Scan for `/vault-capture` items** (EXPLICIT USER REQUEST)

Scan for vault-capture content in three places:

1. **Custom entries** — `type: "custom"` with `customType: "vault-capture"`: extract `data.text`
2. **Custom messages** — `type: "custom_message"` with `customType: "vault-capture"`: extract `details.text`
3. **Raw user messages** containing `/vault-capture` (fallback for pre-extension sessions): extract text after the command

Tag all: `source: "vault-capture"`, `priority: "high"`

**2d. Scan for knowledge-bearing exchanges**

Walk through `message` entries, focusing on:

**User messages (`role: "user"`):**
- Decisions: "let's go with", "we'll use", "decided to", "the approach is"
- Ideas: "what if", "could we", "idea:", "might be worth"
- Todos: "need to", "should", "TODO", "later we should"
- Lessons: "turns out", "the issue was", "learned that"

**Assistant messages (`role: "assistant"`):**
- Recommendations that were accepted (followed by user agreement or implementation)
- Warnings or gotchas: "note that", "be careful", "important:", "gotcha"
- Summaries of accomplishments

**Tool results (`role: "toolResult"`):**
- Only if they contain errors that led to pivots or discoveries
- Generally skip — these are noise

For each knowledge-bearing exchange:
- Extract just the knowledge-bearing part (not the entire message)
- Include enough context to be self-contained
- Tag: `source: "exchange"`, `priority: "medium"`

**2e. Handle message content formats**

Assistant message content may be a simple string or an array of content blocks. If array, extract `text` blocks, skip `tool_use` blocks.

### Manual Mode

**2a. Parse manual input**

Identify distinct knowledge items by splitting on logical boundaries (paragraphs, bullet points, numbered items). Each distinct item → raw extraction. Tag all: `source: "manual"`, `priority: "medium"`.

**2b. Handle freeform text**

If narrative paragraphs rather than structured bullets: identify distinct knowledge claims, split into separate extractions, preserve enough context for each to be self-contained.

### Within-Session Dedup

Before proceeding, remove obvious within-session duplicates:
- Same decision/topic appears multiple times → keep most complete/refined version
- TODO mentioned then completed within same session → skip the TODO
- Log: `"🔄 Removed {N} within-session duplicates"`

### Raw Extraction Format

Each extraction:
```
{
  raw_content: "the extracted text",
  source_file: "filename or 'manual'",
  source_session: "session-id",
  source_type: "compaction|vault-capture|exchange|manual",
  priority: "high|medium",
  timestamp: "ISO-8601"
}
```

### Parse Summary

```
🔍 Parse complete
  sessions scanned: {count}
  compaction summaries: {count}
  vault-capture items: {count}
  knowledge exchanges: {count}
  dedup removed: {count}
  total raw extractions: {count}
```

If zero extractions → HALT: *"📭 No knowledge-worthy content found. Sessions may contain only routine operations."*

---

## Phase 3: Classify Extractions

Categorize each raw extraction by content type and assign confidence. Load `data/extraction-patterns.md` for classification guidance.

### Content Type Definitions

| Type | Signal Words | Description |
|------|-------------|-------------|
| `decision` | decided, chose, selected, approach, trade-off, "go with", "use X" | A choice made between alternatives |
| `lesson` | learned, realized, discovered, mistake, insight, gotcha, "turns out" | Something learned from experience |
| `idea` | idea, proposal, suggestion, "what if", "could we", "might", explore | A new or speculative proposal |
| `todo` | todo, task, action, "need to", "should", "must", fix, implement | An action item or task |
| `pattern` | pattern, recurring, "every time", always, repeatedly, "common approach" | A recurring behavior or approach |

### 3a. Classify each extraction

For each raw extraction:
- Analyze `raw_content` for signal words and overall intent
- Choose the primary type (most specific/actionable)
- If content truly spans two types (e.g., decision containing a todo), split into two extractions

**Ambiguity resolution:** Prefer `todo` > `idea`, `decision` > `lesson`, `lesson` > `idea`. Default fallback: `lesson`.

### 3b. Assign confidence

| Source Type | Default Confidence |
|-------------|-------------------|
| `vault-capture` | `high` — user explicitly captured |
| `compaction` | `high` — pre-filtered by compaction |
| `exchange` (strong signals) | `medium` — inferred from conversation |
| `exchange` (weak signals) | `low` — speculative extraction |
| `manual` (structured bullets) | `medium` — user-provided |
| `manual` (freeform narrative) | `low` — extracted from narrative |

Adjust **up** if: multiple messages reinforce the same point, explicit rationale present, user directly confirmed.
Adjust **down** if: speculative/tentative, tangential discussion, missing rationale.

### 3c. Detect cross-project content

Flag extractions for `_global/` routing (set `is_global: true`) if:
- Content explicitly mentions being general/universal
- References multiple projects by name
- Type is `pattern` (patterns are cross-project by default)

### 3d. Apply confidence threshold

Filter out extractions below `confidence_threshold`:
- `low` threshold (default): include everything
- `medium` threshold: drop `low` confidence items
- `high` threshold: drop `low` and `medium` items
- Log: `"🔽 Confidence filter ({threshold}): dropped {N} items"`

### 3e. Cross-extraction dedup

- Same topic in compaction summary AND raw exchanges → keep compaction version (more refined)
- Same decision in multiple session files → keep most recent
- Log: `"🔄 Cross-extraction dedup: merged {N} near-duplicates"`

### Classification Summary

```
📋 Classification complete
  decisions: {count} | lessons: {count} | ideas: {count} | todos: {count} | patterns: {count}
  global: {count} | project-specific: {count}
  high: {count} | medium: {count} | low: {count}
  dropped: {count} | merged: {count} | total classified: {count}
```

If zero after filtering → HALT: *"📭 All extractions filtered out by confidence threshold ({threshold}). Try lowering the threshold."*

---

## Phase 4: Structure Output

Transform classified extractions into structured objects for vault-update. Do NOT change types or invoke vault-update yet.

### 4a. Polish each extraction's content

**Clean:** Remove conversation artifacts ("well, I think..."), tool call references ("I ran bash..."), agent framing ("As the architect..."). Keep the substance.

**Make self-contained:** Add context implied in conversation but missing from extraction. If a decision references "the two approaches", spell them out. If a lesson references "the bug", describe the bug. The extraction must be understandable by someone who wasn't in the session.

**For `is_global: true` items:** Make the cross-project nature explicit in the content text itself (e.g., "This applies across projects..."). vault-update uses content analysis for routing.

**Write clean prose:**
- Decisions: state the choice and rationale
- Lessons: state what was learned and when it applies
- Ideas: state the proposal and potential value
- Todos: state what needs to be done and context
- Patterns: state the recurring behavior and implications

**Length:** Target 2–6 sentences. Decisions/patterns may be longer. Todos should be concise (1–3 sentences). Don't pad.

### 4b. Build extraction objects

Each structured object:

| Field | Required | Source |
|-------|----------|--------|
| `content` | ✅ | Polished extraction text |
| `project` | ✅ | From initialization context |
| `source-session` | ✅ | Session ID or synthetic manual ID |
| `type` | ✅ | From Phase 3 classification |
| `confidence` | ✅ | From Phase 3 classification |
| `skip_proposals` | Optional | From initialization context |
| `skip_commit` | Optional | `true` for all except the last extraction |
| `force_write` | Optional | `false` (let vault-update handle dedup) |

**Batch commit optimization:** Set `skip_commit: true` for all extractions except the last one. This lets vault-update write multiple entries in a single git commit.

### 4c. Determine processing order

1. **High confidence** items first (most likely to pass dedup)
2. **Decisions and patterns** before lessons and todos (high-stakes first)
3. **Global items** grouped together (efficient indexing)
4. **Last item** should be low-risk (lesson/todo) since it triggers the commit

### Structure Summary

```
📦 Structuring complete
  total objects: {count}
  batch mode: skip_commit=true for {N-1}, false for last
  processing order:
    1. {type} ({confidence}) — "{first 40 chars}..."
    ...
```

---

## Phase 5: Feed vault-update

Pass each structured extraction to vault-update for processing. NEVER write directly to the vault — always go through vault-update.

### 5a. Feed extractions sequentially

For each extraction in the processing order from Phase 4:

**Log progress:**
```
⏳ Processing {N}/{total}: {type} — "{first 40 chars}..."
```

**Invoke vault-update** with the extraction's fields:
```yaml
content: "{polished content}"
project: "{project}"
source-session: "{source-session}"
type: "{type}"
confidence: "{confidence}"
skip_proposals: {true|false}
skip_commit: {true|false}
force_write: false
```

vault-update will: receive the extraction → check for duplicates → refine classification and tags → write the vault file → validate → update indexes → git commit (only if `skip_commit: false`).

**Capture result** — one of:

| Outcome | Description |
|---------|-------------|
| `written` | Successfully written to vault |
| `deduped` | Skipped — duplicate detected |
| `proposed` | Sent to `_proposals/` for review |
| `failed` | Error during processing |

**Handle failures gracefully:** Log the error, continue to next extraction. Do NOT halt the pipeline on individual failures.

### 5b. Final scan report

```
📊 Session Scan Complete
═══════════════════════════

Sessions scanned: {count}
Total extractions found: {count}
Processed through vault-update: {count}

Results:
  ✅ Written: {count}
  🔄 Deduped: {count}
  📋 Proposed: {count}
  ❌ Failed: {count}

By type:
  Decisions: {count} ({outcomes})
  Lessons: {count} ({outcomes})
  Ideas: {count} ({outcomes})
  Todos: {count} ({outcomes})
  Patterns: {count} ({outcomes})

Written entries:
  - {vault_path_1}
  - {vault_path_2}
  ...

{if proposed} Proposals awaiting review:
  - _proposals/{filename}
  ...

{if failed} Failures:
  - {type}: {error}
  ...

═══════════════════════════
```

---

## Rules

- ALWAYS detect input mode automatically — only ask if truly ambiguous
- ALWAYS prioritize compaction summaries (highest signal-to-noise) and `/vault-capture` items (explicit user intent)
- ALWAYS extract signal, not noise — when in doubt, lean toward inclusion (later phases handle dedup)
- ALWAYS make extractions self-contained — readable without the original session
- ALWAYS use vault-update for writes — NEVER write directly to vault files
- ALWAYS handle failures gracefully — continue the pipeline, report at end
- ALWAYS apply batch commit optimization (skip_commit=true for all but last)
- NEVER classify without evidence — every type assignment must be justifiable by content
- NEVER skip within-session or cross-extraction deduplication
- NEVER halt the entire pipeline on a single extraction failure
