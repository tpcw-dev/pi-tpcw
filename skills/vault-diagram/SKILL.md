---
name: vault-diagram
description: Create and update Excalidraw diagrams in the vault. Gathers vault context, prepares a design document, then delegates to draw-diagram for rendering. Triggers on "vault diagram", "visualize vault", "create vault diagram", "update vault diagram".
---

# Vault Diagram — Orchestrator

Gathers vault context, prepares a design document, then delegates to `draw-diagram` for rendering. Handles vault-specific placement and git commits.

For non-vault diagrams, use `draw-diagram` directly.

## Inputs

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `name` | ✅ YES | — | Diagram slug (kebab-case) |
| `project` | No | `_system` | Project name or `_system` for cross-project |
| `description` | ✅ YES | — | What to visualize (natural language) |
| `type` | No | `architecture` | Passed to draw-diagram |
| `depth` | No | `simple` | Passed to draw-diagram |

## Target Paths

| Scope | Diagram Path | Design Doc Path |
|-------|-------------|-----------------|
| System-wide | `_system/diagrams/{name}.excalidraw.md` | `_system/diagrams/{name}.design.md` |
| Project | `projects/{project}/diagrams/{name}.excalidraw.md` | `projects/{project}/diagrams/{name}.design.md` |

## Process

### Step 1: Gather Vault Context

Query the vault for relevant context based on `description`:

```bash
obsidian vault="{vault_name}" search query="{relevant terms}" format=json
```

Also gather structural info:
- Project list and entry counts
- Relevant decisions, todos, patterns
- Existing diagrams in the target location

### Step 2: Prepare Design Document

Create a markdown design doc that captures everything `draw-diagram` needs:

```markdown
# {name} — Design Document

## Goal
{description}

## Current State
{gathered vault context — entities, relationships, structure}

## Entities
- Entity 1: description, role
- Entity 2: description, role
...

## Relationships
- Entity 1 → Entity 2: relationship description
...

## Flow / Sequence
1. Step description
2. Step description
...

## Notes
- Additional context for the renderer
```

### Step 3: Persist Design Document

Write the design doc to the vault alongside the diagram target:

```
{target_dir}/{name}.design.md
```

This enables future updates without re-gathering context.

### Step 4: Invoke draw-diagram

Delegate to `draw-diagram` with:
- `context`: the design document (path or content)
- `name`: the diagram slug
- `output_path`: the vault diagram path
- `type`: passed through
- `depth`: passed through

### Step 5: Git Commit

```bash
cd {vault_path}
git add .
git diff --cached --quiet || git commit -m "vault: add - diagram {name} + design doc"
```

## Update Mode

If the diagram already exists:
1. Read the existing design doc (`{name}.design.md`)
2. Update it with new context or changes
3. Re-invoke `draw-diagram` with updated design doc
4. Git commit: `vault: update - diagram {name}`

## Summary

```
═══════════════════════════════════════
  VAULT DIAGRAM: Complete
═══════════════════════════════════════
  Diagram:    {diagram_path}
  Design Doc: {design_doc_path}
  Scope:      {system | project}
  Git:        {✓ committed | ⚠️ failed}

  View in Obsidian: Open {name}.excalidraw.md
  To iterate: use train-skill-in-loop-manual with draw-diagram
═══════════════════════════════════════
```

## Rules

- ALWAYS prepare a design document before drawing
- ALWAYS persist the design doc alongside the diagram
- ALWAYS delegate rendering to draw-diagram (never generate JSON directly)
- ALWAYS git commit after writing
- Use draw-diagram's output summary to confirm success
