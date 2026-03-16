# Draw Diagram — Shared Preferences

Shared visual preferences applied by ALL diagram renderers (Excalidraw, Canvas, future formats).
Format-specific learned patterns live in `{format}-preferences.md`.

Before drawing any diagram, read this file first, then the format-specific preferences.

---

## General Preferences

- Use clean/modern style unless explicitly asked for hand-drawn
- Always use monospace typography for all text
- Always use descriptive element IDs (e.g., `sage_rect`, `arrow_scan_to_update`)
- Build diagrams section-by-section, never all at once for large diagrams
- Diagrams should **argue visually** — every shape mirrors the concept it represents

---

## Theme: DarkMatter (Active Default)

Derived from [tweakcn DarkMatter](https://tweakcn.com/r/themes/darkmatter.json).
Dark background, warm amber/orange primary, teal secondary, monospace typography.
Use this palette for ALL diagrams unless explicitly overridden.

### Background

| Property | Value | Notes |
|----------|-------|-------|
| Background | `#121113` | DarkMatter dark background |

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

### Arrow/Edge Colors (DarkMatter Dark Mode)

| Type | Color | Style |
|------|-------|-------|
| Data flow | `#e78a53` | Solid, follows source stroke |
| Orchestration | `#6d28d9` | Dotted, purple for Sage delegation |
| Structural | `#888888` | Solid, neutral gray |
| Write path | `#047857` | Solid, green for vault writes |
| Subagent delegation | `#5f8787` | Dashed, teal |

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
