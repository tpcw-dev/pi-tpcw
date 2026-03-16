# Draw Diagram — Shared Preferences

Shared visual preferences applied by ALL diagram renderers (Excalidraw, Canvas, future formats).
Format-specific learned patterns live in `{format}-preferences.md`.

Before drawing any diagram, read this file first, then the active theme, then format-specific preferences.

---

## Active Theme

**`flexoki-dark`**

Load the theme file: `{skill_dir}/data/themes/flexoki-dark.md`

Available presets:
- `flexoki-dark` — Inky, warm, inspired by analog printing inks (active)
- `darkmatter` — High-contrast dark with amber/teal accents

Theme files live in `{skill_dir}/data/themes/`. Each contains background, shape colors,
text colors, arrow/edge colors, and canvas color mapping — all with the same semantic
structure so renderers can swap themes without changing logic.

---

## General Preferences

- Use clean/modern style unless explicitly asked for hand-drawn
- Use monospace typography for all text
- Always use descriptive element IDs (e.g., `sage_rect`, `arrow_scan_to_update`)
- Build diagrams section-by-section, never all at once for large diagrams
- Diagrams should **argue visually** — every shape mirrors the concept it represents

---

## Design Principles

### Visual Argument (not Display)
- The **Isomorphism Test**: remove all text — does the structure alone communicate the concept?
- One-to-many? Use fan-out. Aggregation? Use convergence. Sequence? Use timeline. Loop? Use cycle.
- Each major concept uses a **different** visual pattern. No uniform card grids.

### Information Hierarchy
- **Hero element**: largest, most whitespace around it
- **Primary elements**: clear visual weight
- **Secondary elements**: supporting, smaller
- **Labels**: use typography to create hierarchy

### Narrative Structure
- Every diagram has a **visual story**: entry point → development → resolution
- Guide the eye: left→right or top→bottom for sequences, radial for hub-and-spoke
- Use **gap/break patterns** to separate phases or context shifts

### Exhaustive Path Mapping (for workflows/flowcharts)
- Map **all paths**, not just happy path
- Every decision node: show both branches
- Failure modes: use warning/error colors from palette
- Dead ends: mark explicitly

---

## General Anti-Patterns

- **Uniform card grids**: Don't make everything the same shape and size. Differentiate by concept.
- **Label-only boxes**: Include detail text inside boxes when the design doc provides it. Boxes should be information-rich.
- **Cramped layouts**: If content needs more space, expand the canvas. Spacious with clear separation beats cramped with overlaps.
- **Happy path only**: Always show error/failure paths in workflows.
