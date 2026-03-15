---
name: vault-review
description: Review pending proposals in _proposals/ for approval, rejection, or editing. Present items interactively, feed approved items through vault-update, archive rejections. Triggers on "review proposals", "vault review", "check proposals", "approve proposals", "review vault queue".
---

# Vault Review — Proposal Review Queue

Review proposals pending in `_proposals/`, present them for interactive approve/reject/edit decisions, then process outcomes. Approved items flow through vault-update. Rejected items are archived with rationale.

## Prerequisites

- Vault must be initialized (`_system/_master-index.md` exists)
- `_proposals/` directory must exist with pending items

## Inputs

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `filter_type` | No | `all` | Filter by type (decisions, ideas, etc.) |
| `filter_project` | No | `all` | Filter by project |
| `batch_mode` | No | `false` | Bulk approve/reject without individual review |

---

## Phase 1: Load Proposals

Scan `_proposals/` for pending items:

```
mcp({ tool: "vault_list_directory", args: '{"path": "_proposals/"}' })
```

Collect all `.md` files. Exclude `_archived/` subdirectory, non-markdown files, and index files.

For each proposal, read frontmatter and content:

```
mcp({ tool: "vault_read_note", args: '{"path": "_proposals/{filename}"}' })
```

Extract: path, title, type, confidence, project, source-session, target_folder, created, tags, content.

Flag proposals missing required fields (type, confidence, project) as `incomplete`.

### Apply Filters

If `filter_type` set → keep only matching type.
If `filter_project` set → keep only matching project.

### Sort Order

1. High confidence first
2. Within same confidence: decisions → todos → lessons → patterns → ideas
3. Within same type: oldest `created` first (FIFO)

If zero proposals after filtering, report and halt.

---

## Phase 2: Present Queue

Display a scannable summary:

```
🔮 Vault Review Queue
═══════════════════════

{count} proposals pending review

#  | Type      | Confidence | Project    | Preview                          | Flags
---|-----------|------------|------------|----------------------------------|------
1  | decision  | high       | tpcw-build | "Use MCP-Vault as single write…" |
2  | todo      | medium     | tpcw-build | "Implement session scanner fo…"  | ⚠️ incomplete
...

By type:   decisions ({n}) · todos ({n}) · lessons ({n}) · patterns ({n}) · ideas ({n})
By confidence:   🟢 high ({n}) · 🟡 medium ({n}) · 🔴 low ({n})
```

Flag incomplete proposals that need attention.

---

## Phase 3: Interactive Review Loop

Present each proposal individually with full content and context.

### For Each Proposal

**Display:** Type, confidence, project, source, created date, tags, target folder, full content body, related entries, incomplete warnings.

**Review Menu:**
```
Review: [A]pprove · [R]eject · [E]dit · [S]kip · [BA] Batch approve rest · [Q]uit review
```

### Handle Decisions

| Input | Action |
|-------|--------|
| **A** (Approve) | Record approved, continue |
| **R** (Reject) | Ask for rejection reason, record rejected + reason |
| **E** (Edit) | Show content, collect edits, show edited version, then [A]pprove / [E]dit again / [S]kip |
| **S** (Skip) | Record skipped, continue |
| **BA** (Batch approve) | Confirm, approve all remaining |
| **Q** (Quit) | Confirm, record remaining as skipped |

Show progress after each item:
```
Progress: {current}/{total} | ✅ {approved} · ❌ {rejected} · 📝 {edited} · ⏭️ {skipped}
```

### Batch Mode

If `batch_mode` is true: display all proposals with numbers, accept bulk commands like `approve all`, `reject all`, `approve 1,3,5`.

---

## Phase 4: Process Approvals

For each approved/edited-and-approved proposal, feed through vault-update (Create Mode):

```yaml
content: "{edited content if edited, otherwise original}"
project: "{from proposal frontmatter}"
source-session: "{from proposal frontmatter}"
type: "{from proposal frontmatter}"
confidence: "{from proposal frontmatter}"
skip_proposals: true   # Already reviewed — skip proposal routing
skip_commit: true      # true for all except the last (batch optimization)
force_write: false
```

**Key:** `skip_proposals: true` — these have already been through review.

### Track Results

| Outcome | Description |
|---------|-------------|
| `written` | Successfully written to vault |
| `deduped` | Skipped — duplicate detected |
| `failed` | Error during processing |

After successful write or dedup, delete the original proposal from `_proposals/`:
```
mcp({ tool: "vault_delete_note", args: '{"path": "_proposals/{filename}"}' })
```

Failed proposals stay in `_proposals/` for retry.

Continue on individual failures — don't halt.

---

## Phase 5: Archive Rejections

Move each rejected proposal to `_proposals/_archived/` with rejection metadata.

### For Each Rejection

1. Update frontmatter with rejection metadata:
```
mcp({ tool: "vault_update_frontmatter", args: '{"path": "_proposals/{filename}", "frontmatter": {"status": "rejected", "rejection_reason": "{reason}", "rejected_date": "{YYYY-MM-DD}"}}' })
```

2. Move to archive:
```
mcp({ tool: "vault_move_note", args: '{"path": "_proposals/{filename}", "newPath": "_proposals/_archived/{filename}"}' })
```

**Never delete** rejected proposals — archive preserves decision history.

---

## Phase 6: Summary Report

```
🔮 Vault Review Complete
═══════════════════════════════════

Queue:
  proposals loaded: {total}
  filters applied: {description}

Review Results:
  ✅ Approved: {count}
  📝 Edited & Approved: {count}
  ❌ Rejected: {count}
  ⏭️ Skipped: {count}

Vault Results:
  ✅ Written: {written_count}
  🔄 Deduped: {deduped_count}
  ❌ Failed: {failed_count}

Archive Results:
  🗄️ Archived: {archived_count}

Written entries:
  - {path_1}
  - {path_2}

{if skipped: "Still pending in _proposals/: ..."}
{if failed: "⚠️ Failures: ..."}

═══════════════════════════════════
```

### Next Steps

- If items skipped: "Run vault-review again to revisit skipped proposals."
- If items failed: "Check failed items and retry — they remain in _proposals/."
- If all processed: "🎉 Proposal queue cleared!"

## Rules

- NEVER approve or reject without explicit user input
- NEVER write directly to vault — always go through vault-update
- NEVER delete rejected proposals — archive only
- ALWAYS present full content for informed decisions
- ALWAYS track every decision for the final report
- ALWAYS set `skip_proposals: true` when feeding approved items through vault-update
