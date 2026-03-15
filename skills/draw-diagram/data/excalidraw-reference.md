# Excalidraw Reference for Vault Diagrams

Condensed reference for generating `.excalidraw.md` files compatible with the Obsidian Excalidraw plugin (v2.21.0+).

**Source**: Adapted from [coleam00/excalidraw-diagram-skill](https://github.com/coleam00/excalidraw-diagram-skill) + Obsidian plugin docs.

---

## Obsidian `.excalidraw.md` File Format

The Obsidian Excalidraw plugin stores drawings as markdown files with embedded JSON. The file extension MUST be `.excalidraw.md` (not `.excalidraw`).

### File Structure

```markdown
---
excalidraw-plugin: parsed
tags: [excalidraw]
---
==⚠  Switch to MOBILE view in mobile (mobile-resolve)  ⚠==

# Optional Title

Optional markdown description visible in reading mode.

%%
# Excalidraw Data
## Text Elements
<element-id> ^<link-id>

## Drawing
```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [...],
  "appState": {
    "viewBackgroundColor": "#ffffff",
    "gridSize": 20
  },
  "files": {}
}
```
%%
```

### Key Rules

1. **Frontmatter**: Must include `excalidraw-plugin: parsed` (or `raw`)
2. **JSON block**: Wrapped in `%%` delimiters (Obsidian comment block)
3. **Text Elements section**: Lists text content for search indexing (optional but recommended)
4. **Drawing section**: Contains the actual Excalidraw JSON in a fenced code block
5. Markdown above the `%%` block is visible in reading mode (not in drawing mode)
6. **Wikilinks**: Text elements can contain `[[note-name]]` to link to vault notes

### Simplified Format (Agent-Generated)

For agent-generated diagrams, use this minimal structure:

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

---

## Excalidraw JSON Schema

### Top-Level Structure

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

### Element Types

| Type | Use For |
|------|---------|
| `rectangle` | Processes, actions, components, containers |
| `ellipse` | Entry/exit points, external systems, markers |
| `diamond` | Decisions, conditionals |
| `arrow` | Connections between shapes |
| `text` | Labels (free-floating or inside shapes) |
| `line` | Structural lines (timelines, trees, dividers) |
| `frame` | Grouping containers (optional) |

### Common Properties (All Elements)

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique identifier (use descriptive slugs like `"sage_rect"`) |
| `type` | string | Element type |
| `x`, `y` | number | Position in pixels |
| `width`, `height` | number | Size in pixels |
| `strokeColor` | string | Border color (hex) |
| `backgroundColor` | string | Fill color (hex or `"transparent"`) |
| `fillStyle` | string | `"solid"`, `"hachure"`, `"cross-hatch"` |
| `strokeWidth` | number | 1 (thin), 2 (standard), 3 (bold) |
| `strokeStyle` | string | `"solid"`, `"dashed"`, `"dotted"` |
| `roughness` | number | 0 (clean/modern), 1 (hand-drawn) |
| `opacity` | number | Always 100 |
| `seed` | number | Random seed for rendering |
| `angle` | number | Rotation in radians (usually 0) |
| `version` | number | 1 |
| `versionNonce` | number | Random number |
| `isDeleted` | boolean | false |
| `groupIds` | array | Group membership |
| `boundElements` | array/null | Elements bound to this (text, arrows) |
| `link` | string/null | Optional link |
| `locked` | boolean | false |

### Text-Specific Properties

| Property | Description |
|----------|-------------|
| `text` | Display text (readable words ONLY) |
| `originalText` | Same as `text` |
| `fontSize` | Size in pixels (16-20 recommended) |
| `fontFamily` | 3 (monospace — use this) |
| `textAlign` | `"left"`, `"center"`, `"right"` |
| `verticalAlign` | `"top"`, `"middle"`, `"bottom"` |
| `containerId` | ID of parent shape (null if free-floating) |
| `lineHeight` | 1.25 |

### Arrow-Specific Properties

| Property | Description |
|----------|-------------|
| `points` | Array of `[x, y]` coordinates (relative to element x,y) |
| `startBinding` | `{ "elementId": "id", "focus": 0, "gap": 2 }` |
| `endBinding` | `{ "elementId": "id", "focus": 0, "gap": 2 }` |
| `startArrowhead` | `null`, `"arrow"`, `"bar"`, `"dot"`, `"triangle"` |
| `endArrowhead` | `null`, `"arrow"`, `"bar"`, `"dot"`, `"triangle"` |

### Binding Rules

When an arrow binds to a shape:
1. Arrow's `startBinding`/`endBinding` must reference the shape's `id`
2. Shape's `boundElements` must include `{"id": "arrow_id", "type": "arrow"}`
3. Both sides must be consistent

When text is inside a shape:
1. Text's `containerId` = shape's `id`
2. Shape's `boundElements` must include `{"id": "text_id", "type": "text"}`

### Rectangle Roundness

```json
"roundness": { "type": 3 }
```

---

## Vault Color Palette

Semantic colors for vault diagrams. Consistent visual language across all vault drawings.

### Shape Colors

| Semantic Purpose | Fill | Stroke | Use For |
|------------------|------|--------|---------|
| Primary/Neutral | `#3b82f6` | `#1e3a5f` | Core vault components |
| Secondary | `#60a5fa` | `#1e3a5f` | Supporting components |
| Tertiary | `#93c5fd` | `#1e3a5f` | Background elements |
| Start/Trigger | `#fed7aa` | `#c2410c` | Entry points, triggers |
| End/Success | `#a7f3d0` | `#047857` | Completion, outputs |
| Warning/Reset | `#fee2e2` | `#dc2626` | Errors, resets |
| Decision | `#fef3c7` | `#b45309` | Conditionals, routing |
| Sage/AI | `#ddd6fe` | `#6d28d9` | Sage persona, AI actions |
| Inactive | `#dbeafe` | `#1e40af` | Disabled (dashed stroke) |
| Error | `#fecaca` | `#b91c1c` | Failures |

### Text Colors

| Level | Color | Use For |
|-------|-------|---------|
| Title | `#1e40af` | Section headings |
| Subtitle | `#3b82f6` | Subheadings |
| Body/Detail | `#64748b` | Descriptions, annotations |
| On light fills | `#374151` | Text inside light shapes |
| On dark fills | `#ffffff` | Text inside dark shapes |

### Arrows & Lines

- Arrows: Use source element's stroke color
- Structural lines: `#1e3a5f` or `#64748b`
- Marker dots: `#3b82f6` (fill + stroke)

---

## Element Templates

### Free-Floating Text

```json
{
  "type": "text", "id": "label_xxx",
  "x": 100, "y": 100, "width": 200, "height": 25,
  "text": "Section Title", "originalText": "Section Title",
  "fontSize": 20, "fontFamily": 3, "textAlign": "left", "verticalAlign": "top",
  "strokeColor": "#1e40af", "backgroundColor": "transparent",
  "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid",
  "roughness": 0, "opacity": 100, "angle": 0,
  "seed": 11111, "version": 1, "versionNonce": 22222,
  "isDeleted": false, "groupIds": [], "boundElements": null,
  "link": null, "locked": false, "containerId": null, "lineHeight": 1.25
}
```

### Rectangle + Centered Text

```json
{
  "type": "rectangle", "id": "rect_xxx",
  "x": 100, "y": 100, "width": 180, "height": 60,
  "strokeColor": "#1e3a5f", "backgroundColor": "#3b82f6",
  "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "solid",
  "roughness": 0, "opacity": 100, "angle": 0,
  "seed": 12345, "version": 1, "versionNonce": 67890,
  "isDeleted": false, "groupIds": [],
  "boundElements": [{"id": "text_xxx", "type": "text"}],
  "link": null, "locked": false, "roundness": {"type": 3}
},
{
  "type": "text", "id": "text_xxx",
  "x": 110, "y": 112, "width": 160, "height": 25,
  "text": "Component", "originalText": "Component",
  "fontSize": 16, "fontFamily": 3, "textAlign": "center", "verticalAlign": "middle",
  "strokeColor": "#ffffff", "backgroundColor": "transparent",
  "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid",
  "roughness": 0, "opacity": 100, "angle": 0,
  "seed": 11111, "version": 1, "versionNonce": 22222,
  "isDeleted": false, "groupIds": [], "boundElements": null,
  "link": null, "locked": false, "containerId": "rect_xxx", "lineHeight": 1.25
}
```

### Arrow (Connecting Two Shapes)

```json
{
  "type": "arrow", "id": "arrow_xxx",
  "x": 282, "y": 130, "width": 118, "height": 0,
  "strokeColor": "#1e3a5f", "backgroundColor": "transparent",
  "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "solid",
  "roughness": 0, "opacity": 100, "angle": 0,
  "seed": 33333, "version": 1, "versionNonce": 44444,
  "isDeleted": false, "groupIds": [], "boundElements": null,
  "link": null, "locked": false,
  "points": [[0, 0], [118, 0]],
  "startBinding": {"elementId": "rect_source", "focus": 0, "gap": 2},
  "endBinding": {"elementId": "rect_target", "focus": 0, "gap": 2},
  "startArrowhead": null, "endArrowhead": "arrow"
}
```

### Small Marker Dot

```json
{
  "type": "ellipse", "id": "dot_xxx",
  "x": 94, "y": 94, "width": 12, "height": 12,
  "strokeColor": "#3b82f6", "backgroundColor": "#3b82f6",
  "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid",
  "roughness": 0, "opacity": 100, "angle": 0,
  "seed": 66666, "version": 1, "versionNonce": 77777,
  "isDeleted": false, "groupIds": [], "boundElements": null,
  "link": null, "locked": false
}
```

---

## Design Principles for Vault Diagrams

1. **Diagrams argue, not display** — shape structure should mirror concept behavior
2. **Clean/modern** — `roughness: 0`, `strokeWidth: 2`, `opacity: 100`
3. **Minimal containers** — use free-floating text by default, add shapes only when meaningful
4. **Semantic colors** — match fill/stroke to purpose (Sage = purple, triggers = orange, etc.)
5. **Clear flow** — left-to-right or top-to-bottom, every relationship has an arrow
6. **Descriptive IDs** — `"sage_rect"`, `"arrow_scan_to_update"` not `"elem1"`, `"arrow1"`
7. **Namespace seeds** — section 1 uses 100xxx, section 2 uses 200xxx to avoid collisions
8. **Build section-by-section** — never generate all JSON at once for large diagrams

## Rendering (Validation)

Render pipeline in `~/references/excalidraw-diagram-skill/references/`:

```bash
cd ~/references/excalidraw-diagram-skill/references
uv run python render_excalidraw.py <path-to-file.excalidraw>
```

This renders the raw `.excalidraw` JSON (not `.excalidraw.md`) to PNG for visual validation. For vault files, extract the JSON block first, validate, then wrap in `.excalidraw.md` format.
