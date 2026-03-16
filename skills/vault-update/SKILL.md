---
name: vault-update
description: Centralized write layer for the vault — transforms raw content into properly formatted, deduplicated, indexed, and git-committed vault documents. Also handles edits to existing entries. Triggers on "write to vault", "add to vault", "update vault entry", "edit vault entry", "vault write", "save to vault".
---

# Vault Update — Shared Write Layer

The centralized write layer for the vault. Nothing gets written without going through this skill. Two modes: **Create** (new content) and **Edit** (update existing entry).

## Mode Detection

- **Create Mode** — Input contains `content` + `project` + `source-session` → new entry
- **Edit Mode** — Input contains `path` + `updates` → modify existing entry
- **Ambiguous** — Ask: "Are you adding new content or updating an existing entry?"

---

# CREATE MODE

## Step 1: Receive & Validate

### Required Inputs

| Field | Required | Description |
|-------|----------|-------------|
| `content` | ✅ YES | Raw content to write |
| `project` | ✅ YES | Project name (determines vault folder) |
| `source-session` | ✅ YES | Session identifier for tracking origin |

### Optional Inputs

| Field | Default | Description |
|-------|---------|-------------|
| `type` | `null` | Content type (auto-classified if null) |
| `confidence` | `unknown` | high/medium/low/unknown |
| `skip_proposals` | `false` | Bypass proposal routing |
| `skip_commit` | `false` | Skip git commit (for batch ops) |
| `force_write` | `false` | Skip dedup check |

Validate `type` is one of: decision, lesson, idea, todo, pattern, component, workflow, architecture. Invalid → set to null.
Validate `confidence` is one of: high, medium, low, unknown. Invalid → default to unknown.

If any required field is missing, halt with error.

## Step 2: Dedup Check

If `force_write` is true, skip this step.

Search vault for similar content:
```bash
obsidian vault="<vault>" search query="<key phrases from content>" format=json 2>/dev/null
```

Search within `projects/{project}/`.

### Evaluate Matches

For each result:
1. Check frontmatter — same `source-session`? Same `type` and similar tags?
2. If metadata suggests match, read full note and compare content

### Decision

| Decision | When | Action |
|----------|------|--------|
| **Proceed** | No meaningful matches | Continue pipeline |
| **Skip** | Exact duplicate found | Log, halt pipeline, output summary |
| **Flag** | Near-duplicate with new info | Continue but add `dedup_flagged: true` to frontmatter |

**Rule:** When uncertain, flag — don't skip. Better a flagged entry than lost knowledge.

## Step 3: Classify & Tag

### Auto-Classification (if type is null)

| Type | Keywords/Signals |
|------|-----------------|
| `decision` | decided, chose, selected, approach, trade-off, rationale |
| `lesson` | learned, realized, discovered, mistake, insight, gotcha |
| `idea` | idea, proposal, what if, could, might, explore |
| `todo` | todo, task, need to, should, must, fix, implement |
| `pattern` | pattern, recurring, every time, always, common approach |
| `component` | component, extension, skill, subagent, service, module, plugin |
| `workflow` | workflow, pipeline, process, state machine, lifecycle, data flow |
| `architecture` | architecture, boundary, layer, API surface, module graph, system design |

### Generate Tags

2-5 kebab-case tags. Be specific (prefer `obsidian-cli` over `tools`). Don't include the type as a tag.

### Determine Target Location

**Project vs Global:**
- Content applies across projects → `_global/`
- Type is `pattern` → `_global/patterns/` (default)
- Type is `component` or `workflow` → `projects/{project}/` (always project-scoped)
- Type is `architecture` → `projects/{project}/` or `_global/` (project-scoped by default; use `_global/` when it spans projects)
- Otherwise → `projects/{project}/`

**Direct Write vs Proposals:**
- High-stakes types (`decision`, `pattern`) AND `skip_proposals` is false → `_proposals/`
- `component`, `workflow`, `architecture` → always direct write (never proposals)
- Everything else → direct write to target path

### Generate File Slug

3-5 word kebab-case slug from content topic. No dates in filename.

## Step 4: Write

### Generate Unique ID

Format: `{type}-{project}-{slug}-{YYYYMMDD}`

### Build Frontmatter

Base fields (all types):
```yaml
id: "{generated_id}"
type: "{type}"
project: "{project}"
status: "active"
created: "{YYYY-MM-DD}"
confidence: "{confidence}"
tags: [{tags}]
related: []
source-session: "{source-session}"
```

Type-specific extensions:

| Type | Extra Fields |
|------|-------------|
| **Decision** | `supersedes: ""`, `rationale: ""` |
| **Lesson** | `context: ""`, `validated: false` |
| **Idea** | `feasibility: ""`, `impact: ""` |
| **Todo** | `priority: medium`, `assignee: ""`, `due: ""`, `stage: backlog`, `effort: ""` |
| **Pattern** | `occurrences: 1`, `first-seen: "{date}"`, `last-seen: "{date}"` |
| **Component** | `component-type: extension\|skill\|subagent\|data\|service`, `location: ""` |
| **Workflow** | `trigger: ""`, `participants: []` |
| **Architecture** | `scope: system\|subsystem\|boundary\|api` |

Add `dedup_flagged: true` and `dedup_similar_to: "{path}"` if flagged.
Add `target_folder: "{path}"` if routing to proposals.

### Write via Obsidian CLI

```bash
obsidian vault="<vault>" create path="{target}/{slug}.md" content="---
{frontmatter_as_yaml}
---
{body}" overwrite silent 2>/dev/null
```

## Step 5: Validate

Read back the written file and verify:

1. **Base frontmatter** — all required fields present and valid
2. **Type-specific fields** — all extension fields present with valid values
3. **Enum validation** — type, status, confidence, stage, priority, effort, feasibility, impact
4. **Content body** — starts with `# Title` heading, non-empty

Auto-fix any issues via `obsidian vault="<vault>" property:set`. Halt only on unfixable errors.

## Step 6: Regenerate Indexes

**Project index** (`projects/{project}/_project-index.md`):
1. `obsidian vault="<vault>" files folder="projects/{project}/"` → scan project folder
2. `obsidian vault="<vault>" properties path="..." format=json` → get metadata for each entry
3. Rebuild index grouped by type with wikilinks and descriptions
4. Write with `obsidian vault="<vault>" create path="..." content="..." overwrite silent`

**Master index** (`_system/_master-index.md`):
1. Scan `projects/` for all project folders
2. Count entries per project
3. Scan `_global/` for cross-project entries
4. Write updated master index

Always rebuild from current state — never patch incrementally.

## Step 7: Git Commit

If `skip_commit` is true, skip.

```bash
cd {vault_path}
git add .
git diff --cached --quiet || git commit -m "vault: add - {type} for {project}: {slug}"
```

Git failure → log warning, continue (content is already written).

### Final Summary

```
═══════════════════════════════════════
  VAULT UPDATE: Create Complete
═══════════════════════════════════════
  Entry:      {write_path}
  ID:         {id}
  Type:       {type}
  Tags:       [{tags}]
  Route:      {direct write | proposal}
  Dedup:      {clean | flagged | force-skipped}
  Git:        {✓ committed | ⏭️ skipped | ⚠️ failed}
═══════════════════════════════════════
```

---

# EDIT MODE

## Step 1: Assess Entry

### Required Inputs

| Field | Required | Description |
|-------|----------|-------------|
| `path` | ✅ YES | Vault-relative path to the entry |
| `updates` | ✅ YES | Field/value pairs to apply |

### Optional

| Field | Default | Description |
|-------|---------|-------------|
| `source-session` | null | Session identifier |
| `skip_commit` | false | Skip git commit |

Load entry via `obsidian vault="<vault>" read path="..."`. If not found, halt. Identify type and validate requested update fields against the type's schema.

## Step 2: Apply Edits

Use `obsidian vault="<vault>" property:set path="..." name="..." value="..."`. Automatically add `last-modified: "{YYYY-MM-DD}"`.

For tag changes: `obsidian vault="<vault>" property:set path="..." name="tags" value="..." type=list`.
For content body changes: read via `obsidian vault="<vault>" read`, then write back with `obsidian vault="<vault>" create path="..." content="..." overwrite silent`.

Preserve all fields not included in updates.

## Step 3: Validate

Read back, verify schema compliance (same checks as Create Step 5). Auto-fix issues.

## Step 4: Reindex

Rebuild project index and master index from current state (same as Create Step 6).

## Step 5: Commit

```bash
cd {vault_path}
git add .
git diff --cached --quiet || git commit -m "vault: update - {summary}: {slug}"
```

### Final Summary

```
═══════════════════════════════════════
  VAULT UPDATE: Edit Complete
═══════════════════════════════════════
  Entry:    {path}
  Changes:  {field}: {old} → {new}
  Git:      {✓ committed | ⏭️ skipped | ⚠️ failed}
═══════════════════════════════════════
```

---

## Reference Data

### Frontmatter Schema

**Base fields** (all types): id, type, project, status, created, confidence, tags, related, source-session

**ID format:** `{type}-{project}-{short-slug}-{YYYYMMDD}`

**Enum values:**
- type: decision, lesson, idea, todo, pattern, component, workflow, architecture
- status: active, archived, superseded
- confidence: high, medium, low, unknown
- stage (todo): backlog, in-progress, review, done
- priority (todo): high, medium, low
- effort (todo): small, medium, large

### Vault Conventions

- **Flat structure** — use frontmatter for organization, not deep nesting
- **File naming** — kebab-case, no dates in filenames
- **Git commits** — `vault: {action} - {summary}`
- **Indexes** — rebuild from state, never patch incrementally
- **Dedup** — always check before writing

## Rules

- ALWAYS validate inputs before processing
- ALWAYS check for duplicates before writing (unless force_write)
- ALWAYS use Obsidian CLI commands for all vault file operations
- ALWAYS rebuild indexes from current state (never incremental patches)
- ALWAYS include complete frontmatter (base + type extensions)
- NEVER write without a unique ID
- NEVER leave indexes out of sync
- NEVER fail the pipeline on git errors — content is already safe
