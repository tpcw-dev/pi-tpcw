---
name: draw-diagram
description: "Pure diagram renderer. Takes a context document and produces a diagram file. Supports two formats: Excalidraw (.excalidraw.md) and JSON Canvas (.canvas). No vault awareness — just context in, diagram out. Learns visual preferences over time through training. Triggers on \"draw diagram\", \"render excalidraw\", \"draw canvas\", \"draw this\", \"diagram from context\"."
---

# Draw Diagram — Renderer

Pure rendering skill. Takes a context document and produces a diagram file.
No vault logic, no git, no context gathering — that's the caller's job.

Supports two output formats:
- **excalidraw** (default) → `.excalidraw.md` — rich visual diagrams with bindings, rendered via Obsidian Excalidraw plugin
- **canvas** → `.canvas` — native Obsidian canvas files, simpler format, can embed vault notes as file nodes

## Inputs

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `context` | ✅ YES | — | Markdown document describing what to draw (entities, relationships, flow) |
| `name` | ✅ YES | — | Output filename slug (kebab-case) |
| `output_path` | ✅ YES | — | Where to write the output file |
| `format` | No | `excalidraw` | `excalidraw` or `canvas` |
| `type` | No | `architecture` | `architecture`, `workflow`, `flowchart`, `lifecycle`, `concept` |
| `depth` | No | `simple` | `simple` (conceptual) or `comprehensive` (technical with evidence) |

If `context` is a file path (ends in `.md`), read that file. Otherwise treat it as inline markdown.

## Output Files

| Format | Extension | Requires Plugin |
|--------|-----------|----------------|
| `excalidraw` | `{name}.excalidraw.md` | Yes (Excalidraw plugin) |
| `canvas` | `{name}.canvas` | No (native Obsidian) |

## Process

### Step 1: Load Shared Preferences

Read `{skill_dir}/data/preferences.md` — DarkMatter theme, visual principles, anti-patterns.

### Step 2: Delegate to Format-Specific Renderer

Based on `format`, delegate to the appropriate subagent:

#### If format = excalidraw (default)

Delegate to `excalidraw-renderer` subagent:

```json
{
  "agent": "excalidraw-renderer",
  "task": "Draw an Excalidraw diagram.\n\n- context: {context}\n- name: {name}\n- output_path: {output_path}\n- type: {type}\n- depth: {depth}",
  "mode": "spawn"
}
```

The excalidraw-renderer will:
1. Load `excalidraw-reference.md` + `excalidraw-preferences.md`
2. Analyze context, design plan, generate Excalidraw JSON
3. Wrap in `.excalidraw.md` format
4. Validate via render pipeline if available

#### If format = canvas

Delegate to `canvas-renderer` subagent:

```json
{
  "agent": "canvas-renderer",
  "task": "Draw a JSON Canvas diagram.\n\n- context: {context}\n- name: {name}\n- output_path: {output_path}\n- type: {type}\n- depth: {depth}",
  "mode": "spawn"
}
```

The canvas-renderer will:
1. Load `canvas-reference.md` + `canvas-preferences.md`
2. Analyze context, design plan, generate JSON Canvas
3. Write `.canvas` file
4. Validate ID uniqueness and edge references

### Step 3: Output Summary

```
═══════════════════════════════════════
  DRAW DIAGRAM: Complete
═══════════════════════════════════════
  File:       {output_path}
  Name:       {name}
  Format:     {excalidraw | canvas}
  Type:       {type}
  Validated:  {yes/no}
═══════════════════════════════════════
```

## When to Use Which Format

| Use Case | Recommended Format | Why |
|----------|-------------------|-----|
| Architecture diagrams | Either | Excalidraw for rich visuals, Canvas for vault note embedding |
| Vault-centric diagrams | `canvas` | File nodes link directly to vault entries |
| Training/iteration | `excalidraw` | Render pipeline enables visual validation |
| Quick sketches | `canvas` | Simpler format, faster to generate |
| Complex workflows | `excalidraw` | Better arrow routing, visual weight system |
| Sharing outside Obsidian | `excalidraw` | Can export to PNG via render pipeline |

## Reference Files

All in `{skill_dir}/data/`:

| File | Used By | Purpose |
|------|---------|---------|
| `preferences.md` | Both renderers | Shared theme, layout principles |
| `excalidraw-reference.md` | excalidraw-renderer | Excalidraw JSON schema, templates |
| `excalidraw-preferences.md` | excalidraw-renderer | Excalidraw-specific learned patterns |
| `canvas-reference.md` | canvas-renderer | JSON Canvas spec, examples, validation |
| `canvas-preferences.md` | canvas-renderer | Canvas-specific learned patterns |

## Rules

- ALWAYS load shared preferences before delegating
- ALWAYS delegate to the correct renderer subagent — never generate diagram JSON directly
- NEVER modify preferences files directly — only `train-skill-in-loop-manual` does that
- Default format is `excalidraw` if not specified
