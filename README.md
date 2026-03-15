# pi-tpcw

Persistent vault knowledge management for [pi](https://github.com/badlogic/pi-mono). Gives your coding agent long-term memory backed by an Obsidian vault — decisions, lessons, todos, ideas, and patterns that persist across sessions and projects.

## Install

```bash
pi install npm:pi-tpcw
```

Or from a local path:

```bash
pi install ./pi-tpcw
```

That's it. All extensions, skills, subagent tool, and agent definitions are included.

## New Environment Setup

After installing, two things need one-time setup:

### 1. Obsidian

Install [Obsidian](https://obsidian.md) manually (GUI app). The Excalidraw community plugin is installed automatically by `vault-init`.

### 2. Initialize your vault

In a pi session:

```
> Initialize the vault for my-project at ~/my-vault
```

This runs `vault-init` which creates the vault structure, `.base` views, git repo, and config at `~/.pi/agent/vault-config.json`.

### Everything else is automatic

| Component | How It Gets There |
|-----------|-------------------|
| 11 skills | Bundled in package |
| 5 extensions | Bundled + dependency |
| Subagent tool (`@mjakl/pi-subagent`) | npm dependency, auto-installed |
| `diagram-renderer` agent | Auto-copied to `~/.pi/agent/agents/` on first session |
| Excalidraw render pipeline | Auto-clones from GitHub on first `draw-diagram` use |
| Community agent repos | Auto-clones from GitHub on first `search-agents` use |

## What's Included

### Extensions

| Extension | Description |
|-----------|-------------|
| **vault-guard** | Always-on guardian. Three-state machine (`no-vault` → `vault-exists` → `connected`). Injects Sage persona + vault todo rules. Tracks todo transitions in footer. Auto-installs bundled agents. |
| **plan-mode** | Read-only exploration mode. Produces plans persisted to the vault as design docs + todos. |
| **loop** | `/loop 5m check deploy status` — run prompts on a recurring interval. |
| **skills-browser** | `/skills` — browse and load available skills. |
| **[@mjakl/pi-subagent](https://github.com/mjakl/pi-subagent)** | Delegate tasks to isolated subagents. `spawn`/`fork` modes, parallel execution, depth + cycle guards. |

### Skills

#### Vault Knowledge

| Skill | Trigger | Description |
|-------|---------|-------------|
| `vault-init` | "init vault", "create vault" | Scaffold a new vault or onboard a project |
| `vault-update` | "write to vault", "add to vault" | Centralized write layer — all writes go through this |
| `vault-todo` | "pick up a todo", "mark as review" | Todo lifecycle (backlog → in-progress → review → done) |
| `vault-context` | "onboard project", "scan project" | Extract knowledge from project artifacts (README, configs) |
| `vault-scan` | "scan sessions", "extract knowledge" | Extract knowledge from pi session history |
| `vault-review` | "review proposals", "check proposals" | Approve/reject pending decisions and patterns |
| `vault-status` | "vault status", "vault health" | Health dashboard — stats, staleness, orphans |

#### Diagrams

| Skill | Trigger | Description |
|-------|---------|-------------|
| `vault-diagram` | "vault diagram", "visualize vault" | Orchestrator — gathers vault context, writes design doc, delegates to `draw-diagram` |
| `draw-diagram` | "draw diagram", "diagram from context" | Pure Excalidraw renderer — context in, `.excalidraw.md` out. Learns preferences over time. |

#### Meta

| Skill | Trigger | Description |
|-------|---------|-------------|
| `train-skill-in-loop-manual` | "train skill", "training loop" | Iterative feedback loop via subagents — invoke, present, collect feedback, repeat |
| `search-agents` | "search agents", "find agents" | Browse community agent repos (auto-clones on first use) |

### Bundled Agents

Agent definitions ship in `agents/` and are auto-copied to `~/.pi/agent/agents/` on first `session_start` (won't overwrite user edits).

| Agent | Model | Tools | Purpose |
|-------|-------|-------|---------|
| `diagram-renderer` | claude-sonnet-4-5 | read, write, bash | Draws Excalidraw diagrams from context documents in isolated subagent process |

## Knowledge Types

| Type | Description | Routing |
|------|-------------|---------|
| **Decision** | Architectural/strategic choices with rationale | → `_proposals/` (needs review) |
| **Lesson** | Operational knowledge from experience | → Direct write |
| **Idea** | Speculative proposals, future improvements | → Direct write |
| **Todo** | Action items with stage tracking | → Direct write |
| **Pattern** | Recurring behaviors across sessions | → `_proposals/` (needs review) |

## Vault Structure

```
vault/
├── projects/{project}/
│   ├── _project-index.md
│   ├── {entry}.md
│   └── diagrams/
│       └── {name}.excalidraw.md
├── _global/
├── _system/
│   ├── _master-index.md
│   ├── vault-rules.md
│   └── diagrams/
│       └── {name}.excalidraw.md
├── _proposals/
├── todos.base
├── dashboard.base
└── project-{name}.base
```

## External Dependencies

Not npm packages — git repos that auto-clone to `~/references/` on first use:

| Repo | Cloned By | Purpose |
|------|-----------|---------|
| [coleam00/excalidraw-diagram-skill](https://github.com/coleam00/excalidraw-diagram-skill) | `draw-diagram` | Excalidraw JSON reference + Playwright render pipeline |
| [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) | `search-agents` | 193 community agent definitions across 15 categories |

## Configuration

`~/.pi/agent/vault-config.json` (created by `vault-init`):

```json
{
  "vault_path": "~/my-vault",
  "vault_name": "my-vault",
  "cli_path": "/Applications/Obsidian.app/Contents/MacOS/Obsidian"
}
```

## Architecture

```
User prompt
  │
  ▼
┌─────────────┐     ┌──────────────────┐
│ vault-guard  │────▶│  Sage persona    │  system prompt injection
│ (extension)  │     │  + todo rules    │
└─────────────┘     └──────────────────┘
  │
  ▼ triggers skill
┌─────────────┐     ┌──────────────────┐     ┌────────────┐
│vault-diagram│────▶│  draw-diagram    │────▶│  subagent   │
│(orchestrator)     │  (skill)         │     │  (isolated) │
│ gathers ctx │     │  prepares input  │     │  draws JSON │
│ writes doc  │     └──────────────────┘     └────────────┘
└─────────────┘
  │                 ┌──────────────────┐
  ├────────────────▶│  vault-update    │  shared write layer
  │                 └──────────────────┘
  │                          │
  ▼                          ▼
┌──────────────────────────────────────┐
│           Obsidian Vault             │
│  markdown + frontmatter + git        │
└──────────────────────────────────────┘
```

### Training Loop

```
train-skill-in-loop-manual
  │
  ├─ spawn subagent(diagram-renderer, task + context)
  │      └─ returns result
  ├─ present to user
  ├─ collect feedback
  ├─ spawn subagent(diagram-renderer, task + feedback)
  │      └─ returns updated result
  ├─ repeat until "done"
  └─ persist learnings → draw-diagram/data/preferences.md
```

## Development

```bash
npm test                              # run tests
pi -e ./extensions/vault-guard        # test extension directly
pi install ./                         # test full package
```

## License

MIT
