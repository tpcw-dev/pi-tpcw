# Draw Diagram — Learned Preferences

This file accumulates visual preferences learned through training sessions.
Before drawing any diagram, read this file and apply matching preferences.

Organized by context type. Each entry records what worked and what didn't.

---

## General Preferences

- Use `roughness: 0` (clean/modern) unless explicitly asked for hand-drawn
- Use `fontFamily: 3` (monospace) for all text
- Always use descriptive element IDs (e.g., `sage_rect`, `arrow_scan_to_update`)
- Namespace seeds by section (100xxx, 200xxx, etc.)
- Build JSON section-by-section, never all at once

---

## Theme: DarkMatter (Active Default)

Derived from [tweakcn DarkMatter](https://tweakcn.com/r/themes/darkmatter.json).
Dark background, warm amber/orange primary, teal secondary, monospace typography.
Use this palette for ALL diagrams unless explicitly overridden.

### Canvas

| Property | Value | Notes |
|----------|-------|-------|
| `viewBackgroundColor` | `#121113` | DarkMatter dark background |

### Shape Colors (DarkMatter Dark Mode)

| Semantic Purpose | Fill | Stroke | Use For |
|------------------|------|--------|---------|
| Primary/Hero | `#e78a53` | `#d87943` | Central components, hero elements (e.g., vault-update) |
| Secondary/Teal | `#5f8787` | `#4a6b6b` | Supporting components, I/O layers |
| Gold/Highlight | `#fbcb97` | `#d87943` | Decisions, annotations, callouts |
| Card/Container | `#222222` | `#333333` | Group containers, background panels |
| Muted/Inactive | `#333333` | `#888888` | Disabled, inactive, dashed outlines |
| Sage/AI | `#6d28d9` | `#4c1d95` | Sage persona, AI orchestration (keep purple) |
| Success/Output | `#047857` | `#065f46` | Completion, vault store, outputs |
| Error/Destructive | `#ef4444` | `#b91c1c` | Failures, resets, warnings |
| Subagent/Isolated | `#333333` | `#5f8787` | Subagent containers (dashed border, teal stroke) |
| External/Source | `#222222` | `#888888` | External data sources |

### Text Colors (DarkMatter Dark Mode)

| Level | Color | Use For |
|-------|-------|---------|
| Title | `#fbcb97` | Main title, section headings (gold) |
| Subtitle | `#e78a53` | Subheadings, entity names (amber) |
| Body/Detail | `#999999` | Annotations, descriptions |
| On dark fills | `#c1c1c1` | Text inside dark shapes (foreground) |
| On primary fills | `#121113` | Text inside amber/teal shapes (background) |
| On hero fills | `#121113` | Text inside hero element |

### Arrows & Lines (DarkMatter Dark Mode)

| Type | Color | Style |
|------|-------|-------|
| Data flow | `#e78a53` | Solid, follows source stroke |
| Orchestration | `#6d28d9` | Dotted, purple for Sage delegation |
| Structural | `#888888` | Solid, neutral gray |
| Write path | `#047857` | Solid, green for vault writes |
| Subagent delegation | `#5f8787` | Dashed, teal |

---

## By Context Type

### architecture
- Use DarkMatter palette (dark canvas, amber/teal/purple semantics)
- Hub-and-spoke layout works well for single-agent-multiple-skills architectures
- Hero element (e.g., vault-update) should use Primary/Hero fill to draw the eye
- Convergence pattern: show all write paths funneling to a single write gate
- Group skills by category using Card/Container backgrounds
- External sources on the left, vault/output on the right (left-to-right flow)
- Subagent isolation shown with dashed borders and teal stroke
- Annotation labels ("ALL WRITE PATHS CONVERGE HERE") guide the viewer's eye to key patterns
- **Include detailed bullet-point text** inside each box — hooks, steps, features, counts. Use fontSize 12-14 for detail text. Boxes should be information-rich, not just labels.
- **Arrow routing around boxes**: When arrows span multiple layers, route them through gaps between boxes using waypoints (intermediate points in the points array). NEVER route arrows through or over boxes. Use the spacing between columns as "arrow channels".
- **Callout/annotation boxes** (like "BYPASSES write gate ⚠️" or "/tmp/ ephemeral I/O") must be placed in clear open space — not in the path of routed arrows. Position them in dedicated margins or below/above the elements they annotate.
- **Spacing**: Moderate gaps between boxes (~80-120px horizontal, ~150-200px vertical between layers). Don't over-space — keep related items visually grouped — but leave enough room for arrow channels between columns.
- **Maximize information density**: Include as much detail from the design doc as possible — hooks, steps, features, counts, model tiers, pipeline stages. Each box should be a mini-reference card. Expand canvas size rather than cutting content.
- **Text binding**: ALL text inside a box MUST use `containerId` pointing to the parent rectangle, and the rectangle MUST list the text in its `boundElements` array. This prevents text from floating behind other elements.

### workflow
- When a design doc describes sequential steps, show them as a **vertical chain** inside the parent container — NOT as parallel fan-out arrows
- Numbered steps (1. 2. 3.) inside a hero container effectively communicate sequence
- Subagent isolation boundaries work well as dashed containers
- Side-by-side layout is appropriate for truly parallel operations (e.g., reading Reference + Preferences)
- The validation/fix cycle should use a dashed loop arrow with "fix loop" annotation
- Arrow labels ("spawn subagent", "commits") add helpful context but aren't strictly required

### flowchart
*(no learned preferences yet)*

### lifecycle
*(no learned preferences yet)*

### concept
*(no learned preferences yet)*

---

## Anti-Patterns (things that didn't work)

- **Parallel fan-out for sequential steps**: When the design doc lists steps in order (CLI query → write doc → invoke renderer), do NOT show them as parallel arrows from a single source. The sequential relationship is the key information.
- **Complex looping arrows**: Multi-point cycle arrows for validation loops can overlap and look messy — keep them simple.
- **Arrows overlapping boxes**: Routed arrows that pass through other boxes make the diagram unreadable. Always route through gaps/channels between boxes. Use waypoints in the arrow's points array.
- **Callout boxes in arrow paths**: Annotation boxes (warnings, notes) placed in the path of routed arrows get visually clipped. Place them in clear margins instead.
- **Text elements behind/overlapping containers**: Free-floating text elements that aren't bound to a container rectangle can overlap with other boxes, appearing "in the background". ALWAYS bind text to its parent rectangle using `containerId` on the text and `boundElements` on the rectangle. If text must be free-floating (labels, annotations), position it in clear open space far from any boxes.
- **Text overflowing containers**: When boxes have detailed bullet-point content, SIZE THE RECTANGLE TO FIT ALL THE TEXT. Calculate needed height: (line count × lineHeight × fontSize) + padding. Don't cram long text into small boxes — expand the box or expand the canvas.
- **Canvas too small**: Don't constrain the diagram to a small canvas. If content needs more space, expand to 3000x4000+ pixels. A spacious diagram with clear separation is always better than a cramped one with overlaps.

---

## Session Log

Format: `YYYY-MM-DD | context-type | what was learned`

- 2026-03-16 | workflow | Sequential vs parallel flow distinction; DarkMatter palette; 2 iterations to converge
- 2026-03-16 | architecture | DarkMatter theme persisted as default; hub-and-spoke + convergence patterns; hero element emphasis; full oklch→hex conversion from tweakcn darkmatter.json
- 2026-03-16 | architecture | Training loop: text binding (containerId/boundElements) critical for z-order; expand canvas for info density; arrow-through-box overlap still needs work (waypoint routing); 3 iterations to converge
