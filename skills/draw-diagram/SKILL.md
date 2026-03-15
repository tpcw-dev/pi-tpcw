---
name: draw-diagram
description: Pure Excalidraw diagram renderer. Takes a context document (markdown) and produces a .excalidraw.md file. No vault awareness — just context in, diagram out. Learns visual preferences over time through training. Triggers on "draw diagram", "render excalidraw", "draw this", "diagram from context".
---

# Draw Diagram — Excalidraw Renderer

Pure rendering skill. Takes a context document and produces a `.excalidraw.md` file.
No vault logic, no git, no context gathering — that's the caller's job.

## Before Drawing: Load References

**MANDATORY** — load both files before generating any diagram:

1. `{skill_dir}/data/excalidraw-reference.md` — JSON schema, element templates, color palette
2. `{skill_dir}/data/preferences.md` — learned preferences from past training sessions

Apply any matching preferences for the diagram's context type.

## Inputs

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `context` | ✅ YES | — | Markdown document describing what to draw (entities, relationships, flow) |
| `name` | ✅ YES | — | Output filename slug (kebab-case) |
| `output_path` | ✅ YES | — | Where to write the `.excalidraw.md` file |
| `type` | No | `architecture` | `architecture`, `workflow`, `flowchart`, `lifecycle`, `concept` |
| `depth` | No | `simple` | `simple` (conceptual) or `comprehensive` (technical with evidence) |

If `context` is a file path (ends in `.md`), read that file. Otherwise treat it as inline markdown.

## Process

### Step 1: Analyze Context

Read the context document. Extract:
- **Entities** — things that exist (components, services, roles, states)
- **Relationships** — how entities connect (flows, dependencies, triggers)
- **Hierarchy** — nesting, grouping, layers
- **Sequence** — if there's a time/order dimension

### Step 2: Check Preferences

Read `data/preferences.md`. Look for the matching context type section.
If preferences exist for this type, apply them to the design.

### Step 3: Design (Before Any JSON)

Map concepts to visual patterns:

| If the concept... | Use this pattern |
|-------------------|------------------|
| Spawns multiple outputs | **Fan-out** (radial arrows from center) |
| Combines inputs into one | **Convergence** (funnel, arrows merging) |
| Has hierarchy/nesting | **Tree** (lines + free-floating text) |
| Is a sequence of steps | **Timeline** (line + dots + labels) |
| Loops or improves | **Cycle** (arrow returning to start) |
| Transforms input to output | **Assembly line** (before → process → after) |
| Compares two things | **Side-by-side** (parallel with contrast) |
| Separates into phases | **Gap/Break** (visual separation) |

Output a brief design plan listing entities, patterns, and layout direction.

### Step 4: Generate Excalidraw JSON

Build section by section using templates from `excalidraw-reference.md`:

1. Start with base structure:
```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [],
  "appState": { "viewBackgroundColor": "#ffffff", "gridSize": 20 },
  "files": {}
}
```

2. Add elements per section — descriptive IDs, namespaced seeds
3. Ensure bidirectional bindings (arrow ↔ shape, text ↔ container)
4. Apply semantic colors from palette

### Step 5: Wrap in `.excalidraw.md` Format

```markdown
---
excalidraw-plugin: parsed
tags: [excalidraw]
---

%%
# Drawing
```json
{EXCALIDRAW_JSON}
```
%%
```

### Step 6: Write

Write the file to `output_path` using the Write tool.

### Step 7: Render & Validate (if renderer available)

Bootstrap the render pipeline if missing:
```bash
if [ ! -d ~/references/excalidraw-diagram-skill ]; then
  git clone https://github.com/coleam00/excalidraw-diagram-skill.git ~/references/excalidraw-diagram-skill
  cd ~/references/excalidraw-diagram-skill/references && uv sync && uv run playwright install chromium
fi
```

Then validate:
1. Extract JSON to a temp `.excalidraw` file
2. Run: `cd ~/references/excalidraw-diagram-skill/references && uv run python render_excalidraw.py /tmp/{name}.excalidraw`
3. View the PNG — check for overlaps, clipped text, misaligned arrows
4. Fix issues and re-render (2-4 iterations typical)

### Step 8: Output Summary

```
═══════════════════════════════════════
  DRAW DIAGRAM: Complete
═══════════════════════════════════════
  File:       {output_path}
  Name:       {name}
  Type:       {type}
  Elements:   {count}
  Validated:  {yes/no}
═══════════════════════════════════════
```

## Rules

- ALWAYS load both reference files before drawing
- ALWAYS check preferences.md for learned patterns
- ALWAYS design before generating JSON (Step 3 before Step 4)
- ALWAYS use descriptive element IDs
- ALWAYS ensure bidirectional bindings
- NEVER generate all JSON in one pass for large diagrams
- NEVER invent colors outside the palette
- NEVER put formatting in `text` property — readable words only
- NEVER modify preferences.md directly — only `train-skill-in-loop-manual` does that
