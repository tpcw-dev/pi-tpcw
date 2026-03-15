---
name: search-agents
description: Search community agent repositories for agent definitions that can enhance our subagents. Browse, filter, and adapt agents from curated sources. Auto-clones missing repos on first use. Triggers on "search agents", "find agents", "browse agents", "agent marketplace".
---

# Search Agents — Community Agent Browser

Search community agent repositories for agent definitions. Browse by category, search by keyword, and adapt useful agents for our subagent system.

## Sources

Repos are cloned to `~/references/` on first use. If a source is missing, clone it.

| Source | Repo | Local Path | Agents |
|--------|------|-----------|--------|
| agency-agents | `https://github.com/msitarzewski/agency-agents.git` | `~/references/agency-agents/` | 193 |
| excalidraw-diagram-skill | `https://github.com/coleam00/excalidraw-diagram-skill.git` | `~/references/excalidraw-diagram-skill/` | — |

*More sources will be added in the future.*

## Bootstrap (run on first use or new environment)

Before any search, ensure sources exist. Clone any that are missing:

```bash
mkdir -p ~/references

# agency-agents
if [ ! -d ~/references/agency-agents ]; then
  git clone https://github.com/msitarzewski/agency-agents.git ~/references/agency-agents
fi

# excalidraw-diagram-skill (used by draw-diagram and diagram-renderer)
if [ ! -d ~/references/excalidraw-diagram-skill ]; then
  git clone https://github.com/coleam00/excalidraw-diagram-skill.git ~/references/excalidraw-diagram-skill
  cd ~/references/excalidraw-diagram-skill/references && uv sync && uv run playwright install chromium
fi
```

To update all sources:
```bash
for repo in ~/references/*/; do
  (cd "$repo" && git pull --ff-only 2>/dev/null)
done
```

## Usage

### Browse by Category

```bash
ls ~/references/agency-agents/
```

Categories: `academic`, `design`, `engineering`, `game-development`, `integrations`, `marketing`, `paid-media`, `product`, `project-management`, `sales`, `spatial-computing`, `specialized`, `strategy`, `support`, `testing`

### Search by Keyword

```bash
grep -rli "{keyword}" ~/references/agency-agents --include="*.md" | grep -v README | grep -v CONTRIBUTING | grep -v LICENSE | sort
```

### Read an Agent

```bash
Read: ~/references/agency-agents/{category}/{agent-file}.md
```

### List All with Descriptions

```bash
for f in ~/references/agency-agents/*/*.md; do
  name=$(grep "^name:" "$f" | head -1 | sed 's/name: //')
  desc=$(grep "^description:" "$f" | head -1 | sed 's/description: //' | cut -c1-80)
  if [ -n "$name" ]; then
    printf "%-35s %s\n" "$name" "$desc"
  fi
done
```

## Adapting an Agent

When you find a useful agent, adapt it for pi's subagent system:

### 1. Read the Source Agent

Study its identity, mission, rules, workflow, and communication style.

### 2. Create Pi Agent Definition

Write a markdown file at `~/.pi/agent/agents/{name}.md` with:

```markdown
---
name: {kebab-case-name}
description: {one-line description}
tools: {comma-separated tool list — read, write, bash, grep, find, ls, edit}
model: {model — claude-sonnet-4-5, claude-haiku-4-5, etc.}
---

{System prompt adapted from the source agent}
{Focused on what the agent needs for OUR use case}
{Strip marketing fluff, keep actionable instructions}
```

### 3. Key Adaptation Rules

- **Strip bloat** — agency-agents are verbose. Extract core identity, rules, workflow. Drop success metrics, emoji headers, memory bank references.
- **Add our context** — reference our file paths, conventions, and tools.
- **Restrict tools** — only give the agent tools it actually needs.
- **Pick the right model** — haiku for fast/cheap tasks, sonnet for quality.
- **Test with subagent** — `subagent({ agent: "{name}", task: "..." })`

## Useful Agents for Our Stack

| Agent | Source File | Useful For |
|-------|-----------|------------|
| Visual Storyteller | `design/design-visual-storyteller.md` | Narrative structure in diagrams, visual metaphors |
| UI Designer | `design/design-ui-designer.md` | Design system thinking, visual hierarchy, color theory |
| UX Architect | `design/design-ux-architect.md` | Information architecture, layout frameworks |
| Software Architect | `engineering/engineering-software-architect.md` | System design diagrams, C4 model, trade-off visualization |
| Workflow Architect | `specialized/specialized-workflow-architect.md` | Workflow tree mapping, decision nodes, failure paths |
| Technical Writer | `engineering/engineering-technical-writer.md` | Documentation diagrams, clear labeling |

## Rules

- ALWAYS run bootstrap check before searching (clone missing repos)
- ALWAYS read the full agent file before adapting
- ALWAYS strip to essential instructions when creating pi agent definitions
- NEVER copy agent files verbatim — adapt for our context and tools
- NEVER install agents without testing via subagent first
