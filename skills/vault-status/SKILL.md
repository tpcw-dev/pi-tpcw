---
name: vault-status
description: Vault health check and status dashboard — scans the entire vault and reports statistics, staleness, orphaned links, pending proposals, and suggests maintenance actions. Fully read-only. Triggers on "vault status", "vault health", "check vault", "vault dashboard", "how is the vault".
---

# Vault Status — Health Dashboard

Scan the entire vault and produce a health dashboard with statistics, staleness detection, orphan analysis, and actionable suggestions. **Strictly read-only — never writes to the vault.**

## Prerequisites

- Vault must be initialized (`_system/_master-index.md` exists)

## Inputs

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `project_filter` | No | `all` | Status for specific project only |
| `verbose` | No | `false` | Show all entries, not just issues |
| `staleness_threshold` | No | `30` | Days before an entry is considered stale |

---

## Phase 1: Scan Vault Structure

Scan the entire vault directory using Obsidian CLI:

```bash
obsidian vault="tpcw-vault" files folder="" 2>/dev/null
```

Enumerate all top-level directories, then recurse into each key area:

| Directory | Purpose |
|-----------|---------|
| `projects/` | Per-project knowledge bases |
| `_system/` | Vault configuration and metadata |
| `_global/` | Cross-project shared knowledge |
| `_proposals/` | Pending proposals awaiting review |

For each project in `projects/`, list contents recursively. Record file paths, counts, and directory structure.

Build a complete manifest with per-area file counts and total.

---

## Phase 2: Compute Statistics

Read frontmatter from every vault entry. Compute breakdowns across six dimensions:

### By Type
| Type | Count |
|------|-------|
| decision, lesson, idea, todo, pattern, unknown | {n} each |

### By Project
Count per project, sorted by entry count descending.

### By Confidence
🟢 high | 🟡 medium | 🔴 low | ⚪ unset

### By Age (from `created` date)
| Bucket | Range |
|--------|-------|
| 🟢 Fresh | < 7 days |
| 🟡 Recent | 7–29 days |
| 🟠 Aging | 30–89 days |
| 🔴 Old | ≥ 90 days |
| ⚪ No date | missing `created` |

### By Status
✅ active | 📦 archived | 🔄 superseded | ⚪ unset

### Todos by Stage
📋 backlog | 🔨 in-progress | 👀 review | ✅ done | ⚪ unset

Skip non-entry files (indexes, templates, system config). Track parse failures separately.

---

## Phase 3: Detect Staleness

For each active entry, compute staleness using `last-validated` date (fallback to `created`).

### Staleness Categories

| Category | Condition (default 30d threshold) |
|----------|----------------------------------|
| 🔴 Critically stale | > 60 days (2× threshold) |
| 🟠 Stale | > 30 days (1× threshold) |
| 🟡 Approaching | > 22 days (0.75× threshold) |
| 🟢 Fresh | ≤ 22 days |
| ⚪ No date | missing both dates |

**Skip** archived and superseded entries — they're intentionally old.
**Skip** files in `_proposals/` and `_system/`.

Sort all evaluated entries by `days_since` descending (most stale first).

List critically stale and stale entries with path, type, project, days, and date source.

---

## Phase 4: Find Orphans

### Broken Wikilinks

Extract all `[[wikilinks]]` from every entry's content. Check each resolves to an existing file (case-insensitive filename match). Ignore links inside code blocks.

List broken links with source file and broken target.

### Unreferenced Entries

Find entries with zero incoming links (never linked TO by any other file).

**Exclude from check:** system files, index files, proposals, archived items, root-level files.

Highlight fully isolated entries (zero incoming AND zero outgoing links).

### Empty Directories

Find directories containing zero files within `projects/` and `_global/`. Exclude proposals, archived, system dirs.

### Link Graph Stats

- Entries with outgoing links: {count} ({%})
- Entries with incoming links: {count} ({%})
- Average links per entry: {avg}

---

## Phase 5: Check Proposals

Scan `_proposals/` (excluding `_archived/`) for pending proposals.

Count and categorize by type, project, and age. Find the oldest proposal. Track incomplete proposals (missing required frontmatter).

Zero proposals is a healthy state — not an error.

---

## Phase 6: Health Dashboard

### Calculate Health Score

Start at 100, apply deductions:

| Condition | Deduction |
|-----------|-----------|
| Each critically stale entry | −5 |
| Each stale entry | −2 |
| Each broken wikilink | −3 |
| Each fully isolated entry | −2 |
| Pending proposals > 10 | −1 per excess |
| Any type with zero entries | −1 per missing type |

Score ranges: 💚 90-100 Excellent | 💛 70-89 Good | 🟠 50-69 Fair | 🔴 30-49 Poor | 🚨 0-29 Critical

### Present Dashboard

```
🔮 Vault Health Report
═══════════════════════════════════════════════════════

Health Score: {score}/100 {emoji}

📊 Overview
  Total entries: {count} | Projects: {count} | Global: {count}

📈 Entry Statistics
  By type:    decisions: {n} | lessons: {n} | ideas: {n} | todos: {n} | patterns: {n}
  By confidence: high: {n} | medium: {n} | low: {n}
  By age:     <7d: {n} | <30d: {n} | <90d: {n} | older: {n}
  Todos:      backlog: {n} | in-progress: {n} | review: {n} | done: {n}

⏰ Staleness ({threshold}d threshold)
  🔴 Critical: {n} | 🟠 Stale: {n} | 🟡 Approaching: {n}
  {list most stale entries if any}

🔗 Link Integrity
  Broken links: {n} | Unreferenced: {n} | Isolated: {n} | Empty dirs: {n}
  {list broken links if any}

📋 Pending Proposals: {n}
  {breakdown if any}

═══════════════════════════════════════════════════════

💡 Suggested Actions
  {1-5 actionable suggestions based on findings}
```

### Suggested Actions

Generate 1-5 suggestions based on actual findings:

| Condition | Suggestion |
|-----------|------------|
| Critical entries | "🔴 Validate {n} critically stale entries" |
| Stale entries | "🟠 Review {n} stale entries for accuracy" |
| Pending proposals | "📋 Process {n} pending proposals — run vault-review" |
| Broken links | "🔗 Fix {n} broken wikilinks" |
| Isolated entries | "📭 Connect {n} isolated entries — add links or archive" |
| Score ≥ 90 | "✅ Vault is in excellent shape!" |

## Rules

- NEVER write to the vault — this is strictly read-only
- ALWAYS present data in structured formats, not raw dumps
- ALWAYS calculate health score from actual findings
- ALWAYS provide actionable suggestions
- ALWAYS skip archived/superseded entries from staleness checks
