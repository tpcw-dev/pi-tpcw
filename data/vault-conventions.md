# Vault Conventions

## Folder Structure

```
vault/
├── projects/
│   └── {project-name}/
│       ├── _project-index.md       # Agent-readable project summary
│       ├── {entry-slug}.md         # Individual knowledge entries
│       ├── diagrams/               # Project-specific Excalidraw diagrams
│       │   └── {name}.excalidraw.md
│       └── ...
├── _global/                         # Cross-project knowledge
│   ├── lessons/
│   ├── ideas/
│   └── patterns/
├── _system/                         # Vault metadata
│   ├── _master-index.md
│   ├── vault-rules.md
│   └── diagrams/                    # System-wide Excalidraw diagrams
│       └── {name}.excalidraw.md
└── _proposals/                      # Review queue for high-stakes items
    └── _archived/                   # Rejected proposals (preserved)
```

## File Naming

Format: `{short-descriptive-slug}.md`

- Use kebab-case
- Keep concise but descriptive (3-5 words)
- No dates in filename (dates live in frontmatter)
- No type prefix in filename (type lives in frontmatter)

Examples: `use-mcp-vault-for-writes.md`, `setup-git-hooks.md`, `always-check-dedup-first.md`

## Frontmatter Schema

### Base Fields (All Types)

```yaml
id: "{type}-{project}-{short-slug}-{YYYYMMDD}"
type: decision|lesson|idea|todo|pattern
project: "{project-name}"
status: active|archived|superseded
created: "YYYY-MM-DD"
confidence: high|medium|low|unknown
tags: []
related: []
source-session: "{session-id}"
```

### Type-Specific Extensions

| Type | Fields |
|------|--------|
| **Decision** | `supersedes: ""`, `rationale: ""` |
| **Lesson** | `context: ""`, `validated: false` |
| **Idea** | `feasibility: ""`, `impact: ""` |
| **Todo** | `priority: medium`, `assignee: ""`, `due: ""`, `stage: backlog`, `effort: ""` |
| **Pattern** | `occurrences: 1`, `first-seen: "YYYY-MM-DD"`, `last-seen: "YYYY-MM-DD"` |

## Trust Routing

| Direct Write (low risk) | Proposal Queue (high stakes) |
|-------------------------|------------------------------|
| lesson, todo, idea | decision, pattern |

High-stakes types go to `_proposals/` unless `skip_proposals: true`.

## Git Commit Messages

Format: `vault: {action} - {summary}`

Actions: `add`, `update`, `flag`, `index`, `batch`

Examples:
- `vault: add - decision for tpcw: use-mcp-vault`
- `vault: update - todo stage changed to done: setup-git-hooks`
- `vault: batch - 3 lessons + 2 todos from session scan`

## Index Format

### Project Index (`_project-index.md`)

```markdown
---
project: {project-name}
last-updated: "YYYY-MM-DD"
entry-count: N
---

# {Project Name} — Vault Index

## Decisions (N)
- [[use-mcp-vault-for-writes]] — chose MCP-Vault as primary write interface

## Lessons (N)
- [[always-check-dedup-first]] — dedup before write prevents duplicates

## Todos (N)
- [[setup-git-hooks]] — 🔲 backlog | medium priority

## Ideas (N)
- [[auto-tag-by-content]] — auto-generate tags from content analysis
```

### Master Index (`_master-index.md`)

```markdown
---
last-updated: "YYYY-MM-DD"
project-count: N
total-entries: N
---

# Vault Master Index

## Projects
- [[projects/tpcw/_project-index|tpcw]] — N entries

## Global Knowledge
- **Lessons:** N entries
- **Patterns:** N entries
```

## Diagrams

Excalidraw diagrams live in the vault as `.excalidraw.md` files, viewable via the Obsidian Excalidraw plugin.

### Diagram Locations

| Scope | Path |
|-------|------|
| System-wide (cross-project) | `_system/diagrams/{name}.excalidraw.md` |
| Project-specific | `projects/{project}/diagrams/{name}.excalidraw.md` |

### Naming

Format: `{short-descriptive-slug}.excalidraw.md`

- Use kebab-case
- Keep concise but descriptive (2-5 words)
- Examples: `vault-workflow-overview.excalidraw.md`, `todo-lifecycle.excalidraw.md`

### File Format

`.excalidraw.md` files use the Obsidian Excalidraw plugin format:
- YAML frontmatter with `excalidraw-plugin: parsed`
- Excalidraw JSON wrapped in `%%` comment delimiters
- Written via filesystem tools (NOT MCP-Vault `vault_write_note`)

### Creation

Use the `vault-diagram` skill to create/update diagrams. Reference data in `skills/vault-diagram/data/excalidraw-reference.md`.

## Idempotency Rules

- Writing the same content twice → caught by dedup (skip or flag)
- Index regeneration → always rebuild from current vault state (never incremental)
- Git commit → only if staged changes exist (`git diff --cached --quiet || git commit`)
