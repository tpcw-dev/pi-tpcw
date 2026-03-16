# Theme: Flexoki Dark

[Flexoki](https://stephango.com/flexoki) by Steph Ango (@kepano).
An inky color scheme inspired by analog printing inks and warm shades of paper.

Dark mode uses the 400-series accents (lighter) for fills and 600-series (darker) for strokes.
Base scale runs from black `#100F0F` to paper `#FFFCF0`.

Source: https://github.com/kepano/flexoki

---

## Background

| Property | Value | Flexoki Token |
|----------|-------|---------------|
| Background | `#100F0F` | black |

## Shape Colors

| Semantic Purpose | Fill | Stroke | Use For | Flexoki Tokens |
|------------------|------|--------|---------|----------------|
| Primary/Hero | `#DA702C` | `#BC5215` | Central components, hero elements | orange-400 / orange-600 |
| Secondary | `#3AA99F` | `#24837B` | Supporting components, I/O layers | cyan-400 / cyan-600 |
| Highlight | `#D0A215` | `#AD8301` | Decisions, annotations, callouts | yellow-400 / yellow-600 |
| Card/Container | `#282726` | `#403E3C` | Group containers, background panels | base-900 / base-800 |
| Muted/Inactive | `#343331` | `#6F6E69` | Disabled, inactive, dashed outlines | base-850 / base-600 |
| Sage/AI | `#8B7EC8` | `#5E409D` | AI orchestration (purple) | purple-400 / purple-600 |
| Success/Output | `#879A39` | `#66800B` | Completion, outputs | green-400 / green-600 |
| Error/Destructive | `#D14D41` | `#AF3029` | Failures, warnings | red-400 / red-600 |
| Subagent/Isolated | `#282726` | `#3AA99F` | Subagent containers (dashed, cyan stroke) | base-900 / cyan-400 |
| External/Source | `#1C1B1A` | `#6F6E69` | External data sources | base-950 / base-600 |

## Text Colors

| Level | Color | Use For | Flexoki Token |
|-------|-------|---------|---------------|
| Title | `#D0A215` | Main title, section headings (gold) | yellow-400 |
| Subtitle | `#DA702C` | Subheadings, entity names (orange) | orange-400 |
| Body/Detail | `#878580` | Annotations, descriptions | base-500 |
| On dark fills | `#CECDC3` | Text inside dark shapes | base-200 |
| On primary fills | `#100F0F` | Text inside colored shapes | black |
| On hero fills | `#100F0F` | Text inside hero element | black |

## Arrow/Edge Colors

| Type | Color | Style | Flexoki Token |
|------|-------|-------|---------------|
| Data flow | `#DA702C` | Solid | orange-400 |
| Orchestration | `#8B7EC8` | Dotted, purple | purple-400 |
| Structural | `#6F6E69` | Solid, neutral | base-600 |
| Write path | `#879A39` | Solid, green | green-400 |
| Subagent delegation | `#3AA99F` | Dashed, cyan | cyan-400 |

## Canvas Color Mapping

For JSON Canvas, use hex values (NOT preset numbers):

| Semantic Purpose | Canvas Color |
|------------------|-------------|
| Primary/Hero | `"#DA702C"` |
| Secondary | `"#3AA99F"` |
| Highlight | `"#D0A215"` |
| Card/Container | `"#282726"` |
| Sage/AI | `"#8B7EC8"` |
| Success/Output | `"#879A39"` |
| Error/Destructive | `"#D14D41"` |

## Extended Palette Reference

For fine-grained use, the full Flexoki scale is available:

### Base (dark → light)
| Token | Hex |
|-------|-----|
| black | `#100F0F` |
| base-950 | `#1C1B1A` |
| base-900 | `#282726` |
| base-850 | `#343331` |
| base-800 | `#403E3C` |
| base-700 | `#575653` |
| base-600 | `#6F6E69` |
| base-500 | `#878580` |
| base-400 | `#9F9D96` |
| base-300 | `#B7B5AC` |
| base-200 | `#CECDC3` |

### Accents (400 = light variant, 600 = dark variant)
| Color | 400 (fill) | 600 (stroke) |
|-------|-----------|-------------|
| Red | `#D14D41` | `#AF3029` |
| Orange | `#DA702C` | `#BC5215` |
| Yellow | `#D0A215` | `#AD8301` |
| Green | `#879A39` | `#66800B` |
| Cyan | `#3AA99F` | `#24837B` |
| Blue | `#4385BE` | `#205EA6` |
| Purple | `#8B7EC8` | `#5E409D` |
| Magenta | `#CE5D97` | `#A02F6F` |
