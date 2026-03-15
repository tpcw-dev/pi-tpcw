# Extraction Patterns by Category

## What to Extract

Project artifacts contain knowledge embedded in documentation, specs, and config. Your job is to find decisions, lessons, ideas, todos, and patterns — not to re-document the project.

### README / Design Docs

Look for:
- **Architecture statements**: "We use X for Y", "The system is built on", "Architecture: ..."
- **Technology choices**: specific library/framework/tool selections with rationale
- **Design principles**: stated guidelines or philosophies
- **Trade-off discussions**: "We chose X over Y because..."
- **Setup requirements**: prerequisites that imply infrastructure decisions

### BMAD Artifacts (PRDs, Specs, Brainstorms)

Look for:
- **Requirements that became decisions**: "Must support X", "Will use Y approach"
- **Architecture from PRD**: system design, component structure, data flow
- **Rejected alternatives**: options considered but not chosen (captures rationale)
- **Open questions**: unresolved items → potential todos or ideas
- **Brainstorm outputs**: ideas proposed, ranked, or selected

### TODO / Roadmap / Changelog

Look for:
- **Open items**: uncompleted tasks → todos
- **Completed items with context**: "Done: migrated X because Y" → decisions/lessons
- **Milestones**: planned features or phases → ideas or todos
- **Breaking changes**: in changelogs → decisions with rationale

### Package / Config Files

Look for:
- **Key dependencies**: major libraries that represent architectural decisions
- **Scripts/commands**: build, test, deploy commands that reveal workflow decisions
- **Config structure**: environment variables, feature flags → architecture

### Spec Files

Look for:
- **Agent/workflow design**: chosen approaches, integration points
- **Implementation notes**: guidance that captures lessons or decisions
- **Planned features**: items not yet built → todos or ideas

## What to Skip

- Boilerplate documentation (license, contributing guidelines)
- API reference docs generated from code
- Test fixtures and sample data
- Generic README sections ("Installation", "Usage") unless they contain decisions
- Content already captured in the vault from prior session scans

## Content Type Classification

| Type | Signal Words | Common Sources |
|------|-------------|----------------|
| `decision` | decided, chose, selected, approach, trade-off, "use X for Y" | README, DESIGN, PRDs |
| `lesson` | learned, realized, discovered, mistake, gotcha | Docs, changelogs |
| `idea` | idea, proposal, "what if", "could we", explore | Brainstorms, roadmap |
| `todo` | todo, task, "need to", "should", fix, implement | TODO.md, specs |
| `pattern` | pattern, recurring, always, convention, standard | Docs, conventions |

## Confidence Assignment

| Source Category | Default Confidence |
|----------------|-------------------|
| readme, design, bmad | high |
| planning, documentation, specs | medium |
| config, package, infra | low |

Adjust up if content includes explicit rationale. Adjust down if vague or potentially outdated.
