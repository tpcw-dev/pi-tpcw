---
name: vault-diagram
description: Create and update Excalidraw diagrams in the vault. Pure orchestrator — delegates to vault-scout (context), tech-writer (design doc), and diagram-renderer (Excalidraw). Triggers on "vault diagram", "visualize vault", "create vault diagram", "update vault diagram".
---

# Vault Diagram — Orchestrator

Pure orchestrator. Delegates all work to three subagents: `vault-scout` (context gathering), `tech-writer` (design doc), and `diagram-renderer` (Excalidraw rendering). Handles vault-specific placement and git commits.

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

### Step 1: Delegate Context Gathering to vault-scout

Use the `subagent` tool to delegate to `vault-scout`:

```json
{
  "agent": "vault-scout",
  "task": "Gather vault context for a diagram.\n\n## Domain\n{description}\n\n## Vault Name\ntpcw-vault\n\n## Project Scope\n{project or 'vault-wide'}\n\n## Output Path\n{context_path}",
  "mode": "spawn"
}
```

Where `{context_path}` is a temp file (e.g., `/tmp/vault-scout-{name}.md`).

The vault-scout will search the vault, read matched entries, gather structural info, and write a compiled context block.

### Step 2: Verify Scout Output & Delegate Design Doc to tech-writer

After vault-scout completes, verify the context file exists, then delegate to `tech-writer`:

```json
{
  "agent": "tech-writer",
  "task": "Write a design document for a diagram.\n\n## Goal\n{description}\n\n## Raw Context\n{read the context file from vault-scout}\n\n## Output Path\n{design_doc_path}\n\n## Metadata\n- Type: {type}\n- Depth: {depth}\n- Project: {project}",
  "mode": "spawn"
}
```

The tech-writer will analyze the raw context, extract entities and relationships, and write a structured design doc to the output path.

### Step 3: Verify Design Doc

After tech-writer completes, verify the design doc exists:

```bash
test -f {design_doc_path} && echo "✓ Design doc written" || echo "✗ Design doc missing"
```

Read it briefly to confirm it has the expected sections (Entities, Relationships, etc.).

### Step 4: Delegate Rendering to draw-diagram / diagram-renderer

Delegate to `diagram-renderer` subagent:

```json
{
  "agent": "diagram-renderer",
  "task": "Draw an Excalidraw diagram.\n\n- context: {design_doc_path}\n- name: {name}\n- output_path: {diagram_path}\n- type: {type}\n- depth: {depth}",
  "mode": "spawn"
}
```

### Step 5: Git Commit

```bash
cd {vault_path}
git add .
git diff --cached --quiet || git commit -m "vault: add - diagram {name} + design doc"
```

## Update Mode

If the diagram already exists:
1. Read the existing design doc (`{name}.design.md`)
2. Delegate to `vault-scout` to gather fresh vault context
3. Delegate to `tech-writer` with both the existing design doc and fresh context — instruct it to update, not rewrite from scratch
4. Delegate to `diagram-renderer` with updated design doc
5. Git commit: `vault: update - diagram {name}`

## Summary

```
═══════════════════════════════════════
  VAULT DIAGRAM: Complete
═══════════════════════════════════════
  Diagram:    {diagram_path}
  Design Doc: {design_doc_path}
  Scope:      {system | project}
  Git:        {✓ committed | ⚠️ failed}

  Delegated to:
    vault-scout      → context gathering
    tech-writer      → design doc
    diagram-renderer → excalidraw rendering

  View in Obsidian: Open {name}.excalidraw.md
  To iterate: use train-skill-in-loop-manual with draw-diagram
═══════════════════════════════════════
```

## Rules

- NEVER gather vault context directly — always delegate to vault-scout
- NEVER write design docs directly — always delegate to tech-writer
- NEVER generate diagram JSON — always delegate to diagram-renderer
- ALWAYS delegate in order: vault-scout → tech-writer → diagram-renderer
- ALWAYS persist the design doc alongside the diagram
- ALWAYS git commit after writing
- ALWAYS use spawn mode for subagent delegation (all three subagents need no session context)
