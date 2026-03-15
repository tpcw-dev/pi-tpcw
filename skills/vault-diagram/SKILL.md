---
name: vault-diagram
description: Create and update Excalidraw diagrams in the vault, viewable via the Obsidian Excalidraw plugin. Use when user wants to visualize workflows, architecture, vault structure, or any system design. Triggers on "create diagram", "draw architecture", "vault diagram", "visualize workflow", "excalidraw", "update diagram".
---

# Vault Diagram — Excalidraw Generator

Create and maintain `.excalidraw.md` diagrams in the vault, viewable and editable via the Obsidian Excalidraw plugin.

## Prerequisites

- Vault must be initialized
- Obsidian Excalidraw plugin must be installed in the vault

## Reference Data

**BEFORE generating any diagram**, load the reference file:

```
Read: {skill_dir}/data/excalidraw-reference.md
```

This contains the JSON schema, element templates, color palette, `.excalidraw.md` file format, and design principles.

## Inputs

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `name` | ✅ YES | — | Diagram slug (kebab-case, e.g. `vault-workflow-overview`) |
| `project` | No | `_system` | Project name or `_system` for cross-project diagrams |
| `description` | ✅ YES | — | What to visualize (natural language) |
| `type` | No | `architecture` | `flowchart`, `architecture`, `workflow`, `entity-relationship`, `concept` |
| `depth` | No | `simple` | `simple` (conceptual) or `comprehensive` (technical with evidence artifacts) |

If `name` is missing, ask: *"What should this diagram be called? (kebab-case slug)"*
If `description` is missing, ask: *"What should this diagram visualize?"*

## Mode Detection

- **Create Mode** — Target `.excalidraw.md` file does NOT exist → generate from scratch
- **Update Mode** — Target `.excalidraw.md` file EXISTS → read existing, modify, re-write

## Target Path

| Scope | Path |
|-------|------|
| System-wide | `_system/diagrams/{name}.excalidraw.md` |
| Project-specific | `projects/{project}/diagrams/{name}.excalidraw.md` |

---

## Create Mode

### Step 1: Design (Before Any JSON)

Follow the design process from the reference:

1. **Assess depth** — simple/conceptual or comprehensive/technical?
2. **Understand deeply** — what does each concept DO? What relationships exist?
3. **Map concepts to patterns** — fan-out, convergence, timeline, tree, cycle, assembly line, side-by-side, gap
4. **Ensure variety** — each major concept uses a different visual pattern
5. **Sketch the flow** — trace how the eye moves through the diagram

Output a brief design plan before generating JSON.

### Step 2: Generate Excalidraw JSON

Build the JSON **section by section** (never all at once for large diagrams):

1. Start with the base structure:
```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [],
  "appState": {
    "viewBackgroundColor": "#ffffff",
    "gridSize": 20
  },
  "files": {}
}
```

2. Add elements section by section using templates from the reference
3. Use **descriptive string IDs** (e.g., `"sage_rect"`, `"arrow_scan_to_update"`)
4. **Namespace seeds by section** (section 1 = 100xxx, section 2 = 200xxx)
5. Ensure all bindings are bidirectional (arrow ↔ shape, text ↔ container)
6. Apply semantic colors from the palette

### Step 3: Wrap in `.excalidraw.md` Format

```markdown
---
excalidraw-plugin: parsed
tags: [excalidraw]
---

%%
# Drawing
```json
{EXCALIDRAW_JSON_HERE}
```
%%
```

### Step 4: Write to Vault

Create the diagram directory if needed and write the file:

```bash
mkdir -p "{vault_path}/{target_dir}"
```

Write the `.excalidraw.md` file using the Write tool (NOT MCP-Vault — `.excalidraw.md` files are not standard markdown notes).

### Step 5: Validate (Optional but Recommended)

For visual validation, extract the JSON and render:

```bash
# Extract JSON from .excalidraw.md to temp file
cd ~/references/excalidraw-diagram-skill/references

# Create temp .excalidraw file with just the JSON
uv run python render_excalidraw.py /tmp/diagram-validate.excalidraw
```

View the PNG output and fix any issues (overlapping text, misaligned arrows, spacing).

### Step 6: Git Commit

```bash
cd {vault_path}
git add .
git diff --cached --quiet || git commit -m "vault: add - diagram {name}"
```

---

## Update Mode

### Step 1: Read Existing Diagram

Read the `.excalidraw.md` file and extract the JSON block from between `%%` delimiters.

### Step 2: Modify Elements

Parse the JSON, make targeted changes:
- Add new elements (append to `elements` array)
- Update positions (`x`, `y`), sizes (`width`, `height`), or text
- Add/remove arrows (update bindings on both ends)
- Change colors (use semantic palette)

### Step 3: Re-wrap and Write

Rebuild the `.excalidraw.md` file with updated JSON and write back.

### Step 4: Git Commit

```bash
cd {vault_path}
git add .
git diff --cached --quiet || git commit -m "vault: update - diagram {name}"
```

---

## Summary Output

```
═══════════════════════════════════════
  VAULT DIAGRAM: {Create|Update} Complete
═══════════════════════════════════════
  Diagram:    {target_path}
  Name:       {name}
  Type:       {type}
  Elements:   {count} elements
  Scope:      {system | project}
  Git:        {✓ committed | ⏭️ skipped | ⚠️ failed}

  View in Obsidian: Open {name}.excalidraw.md
═══════════════════════════════════════
```

## Rules

- ALWAYS load `data/excalidraw-reference.md` before generating diagrams
- ALWAYS use descriptive element IDs (never `elem1`, `arrow2`)
- ALWAYS ensure bidirectional bindings (arrow ↔ shape, text ↔ container)
- ALWAYS use the semantic color palette from the reference
- ALWAYS write `.excalidraw.md` files via Write tool (not MCP-Vault)
- ALWAYS set `roughness: 0` for clean modern diagrams (unless hand-drawn requested)
- NEVER generate all JSON in one pass for large diagrams — build section by section
- NEVER use transparency (`opacity` must be 100)
- NEVER put formatting in the `text` property — readable words only
