# Canvas — Learned Preferences

Format-specific preferences for the JSON Canvas renderer.
Accumulated through training sessions with `train-skill-in-loop-manual`.

Before drawing, also load the shared `preferences.md` and the active theme for colors.

---

## Canvas Color Rules

- Always use hex color values from the active theme's "Canvas Color Mapping" section
- NEVER use preset numbers (`"1"`-`"6"`) — those vary per Obsidian theme and won't match
- Apply semantic colors consistently: hero = Primary/Hero, containers = Card/Container, etc.

---

## Node Sizing (CRITICAL)

Obsidian canvas renders markdown inside text nodes with generous spacing. Nodes that are
too small become scrollable and text gets cut off — this is the #1 quality issue.

### Sizing Formula

Before placing any node, calculate the required size from its text content:

```
width  = max(longest_line_chars × 10 + 80, 300)
height = header_lines × 44 + other_lines × 30 + 60
```

Where:
- `header_lines` = lines starting with `#`
- `other_lines` = all other lines (including blanks, bullets, bold)
- `longest_line_chars` = character count of the longest line

### Reference Sizes

| Node Type | Typical Width | Typical Height | Text Lines |
|-----------|--------------|----------------|------------|
| Extension card | 400-450 | 260-290 | 6-8 |
| Skill card | 280-350 | 220-230 | 5-6 |
| Subagent card | 280-400 | 220-230 | 5-6 |
| Hero element | 800-900 | 350-400 | 8-10 |
| Persistence card | 500-600 | 250-260 | 6-7 |

### Text Brevity Rule

Keep text content to **~25 characters per line maximum** for compact layouts.
Use markdown formatting to convey hierarchy:
- `# Title` for the component name
- `**bold**` or `*italic*` for role/model tier
- Bullet lists for capabilities
- Emoji sparingly for visual markers (🔀 🔗 ⚠️ 🔒)

---

## Layout Rules

### Row Splitting
- **≤5 nodes**: single row works
- **6 nodes**: single row, but tight — keep text very short
- **≥7 nodes**: split into 2 rows (e.g., 4+3) for more width per node
- Always calculate: `node_width = (total_width - 2×padding - (n-1)×gap) / n`
- If computed width < 280px, split into more rows

### Spacing
- Padding inside groups: 30px
- Gap between nodes: 25-30px
- Gap between layer groups: 50-80px (80+ before hero for emphasis)
- Group header offset: 55px (space for the group label)

### Groups
- Use groups for each architectural layer
- Groups render as colored backgrounds in Obsidian — great for visual separation
- Place group nodes FIRST in the nodes array (they render as bottom z-layer)
- Group width should be uniform across all layers (set to widest layer)

---

## Edge Consolidation

### Target: 8-10 edges maximum for readability

Too many edges creates visual clutter. Consolidate:

| Pattern | Instead of | Use |
|---------|-----------|-----|
| Many-to-one | 5 separate skill → write-gate edges | 1 group → node edge: "ALL write paths converge" |
| Fan-out | 5 separate orchestrator → subagent edges | 1 edge to subagent group: "fan-out (5 parallel)" |
| Sequential chain | 3 separate A→B, B→C, C→D edges | 1 edge: "chain: scout → writer → renderer" |
| Read access | Multiple components reading same source | 1 representative edge with label |

### Keep individual edges for:
- Architectural exceptions (bypass paths — always highlight with error color)
- Cross-layer shortcuts that break the normal flow
- Key lifecycle hooks (vault-guard → vault-scan)

---

## By Context Type

### architecture
- 5-layer vertical stacking works well (extensions → skills → subagents → write gate → persistence)
- Hero element (write gate) gets extra top margin (80px gap) for visual emphasis
- Subagent model tiers shown via color: blue (#4385BE) for opus, default for sonnet/haiku
- Bypass paths in error color (#D14D41) to make exceptions unmissable
- Filesystem node in highlight color (#D0A215) when it's a bypass target
- Groups colored by semantic role: purple (extensions/AI), yellow (skills), cyan (subagents), orange (write gate), green (persistence)

### workflow
*(no learned preferences yet)*

### flowchart
*(no learned preferences yet)*

### lifecycle
*(no learned preferences yet)*

### concept
*(no learned preferences yet)*

---

## Canvas-Specific Anti-Patterns

- **Text overflow / scrollable nodes**: The #1 failure mode. ALWAYS size nodes to fit ALL text. Use the sizing formula above. If in doubt, make it bigger.
- **Too many edges**: >12 edges makes a canvas unreadable. Consolidate using group-to-node edges and labeled summaries.
- **7+ nodes in one row**: Creates nodes too narrow for text. Split into multiple rows.
- **Preset color numbers**: NEVER use `"1"`-`"6"` — they vary per Obsidian theme. Always use hex.
- **Long text lines**: Lines >25 chars will overflow narrow nodes. Keep text concise, use abbreviations.

---

## Canvas Strengths to Leverage

- `type: file` nodes can embed vault entries directly — use for architecture diagrams that reference vault docs
- Markdown rendering inside text nodes — use headers, bold, lists for rich content
- Groups provide visual containment without the binding complexity of Excalidraw
- Native Obsidian rendering — no plugin required
- Simpler format = fewer rendering bugs

---

## Session Log

Format: `YYYY-MM-DD | context-type | what was learned`

- 2026-03-16 | architecture | Text overflow is #1 issue — must size nodes to fit content. 7 nodes per row too tight — split to 4+3. Consolidate 18→9 edges using group-to-node patterns. Flexoki Dark theme applied. 2 iterations to converge.
