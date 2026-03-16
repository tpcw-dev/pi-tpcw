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

## By Context Type

### architecture
*(no learned preferences yet — will be populated through training)*

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

---

## Session Log

Format: `YYYY-MM-DD | context-type | what was learned`

- 2026-03-16 | workflow | Sequential vs parallel flow distinction; DarkMatter palette; 2 iterations to converge
