# pi-tpcw

Persistent vault knowledge management for [pi](https://github.com/mariozechner/pi). Gives your coding agent a long-term memory backed by an Obsidian vault.

## What It Does

pi-tpcw adds a persistent knowledge layer to pi sessions. Your agent remembers decisions, lessons, todos, ideas, and patterns across sessions and projects — stored as structured markdown in an Obsidian vault.

### Extension: Vault Guard

Always-on extension that manages the vault lifecycle:

- **Three-state machine:** `no-vault` → `vault-exists` → `connected`
- **System prompt injection:** Injects Sage persona and vault todo discipline when connected
- **Todo tracking:** Monitors vault MCP calls and shows active todo in the footer
- **Commands:** `/vault-setup` (configure vault), `/vault-todo` (show tracking status)

### Skills

| Skill | Description |
|-------|-------------|
| `vault-init` | Initialize a new vault or onboard a project into an existing one |
| `vault-update` | Centralized write layer — all vault writes go through this |
| `vault-todo` | Todo lifecycle management (backlog → in-progress → review → done) |
| `vault-context` | Onboard a project by scanning its files for knowledge |
| `vault-scan` | Extract knowledge from session history (JSONL logs) |
| `vault-review` | Review pending proposals — approve, reject, or edit |
| `vault-status` | Health dashboard with stats, staleness, orphans |

## Prerequisites

- [pi](https://github.com/mariozechner/pi) installed
- An [MCP-Vault](https://github.com/Jaseci-Labs/mcpvault) server running and configured
- An Obsidian vault (or any folder of markdown files)

## Installation

```bash
pi install pi-tpcw
```

Or install locally for development:

```bash
pi install ./pi-tpcw
```

## Quick Start

1. **Install the package:**
   ```bash
   pi install pi-tpcw
   ```

2. **Configure your vault:**
   Run `/vault-setup ~/path/to/your/vault` in a pi session.

3. **Initialize the vault structure:**
   Tell the agent: "Initialize the vault for my-project"

4. **Start working.** The Sage persona will automatically:
   - Track todo stage transitions
   - Remind you to search vault before creating new todos
   - Show active tracking in the footer

## Configuration

The extension reads from `~/.pi/agent/vault-config.json`:

```json
{
  "vault_path": "~/my-vault"
}
```

Created automatically by `/vault-setup` or the `vault-init` skill.

## Knowledge Types

| Type | Description | Trust Level |
|------|-------------|-------------|
| **Decision** | Architectural/strategic choices with rationale | High stakes → proposals |
| **Lesson** | Operational knowledge from experience | Direct write |
| **Idea** | Speculative proposals and future improvements | Direct write |
| **Todo** | Action items with stage tracking (Kanban-compatible) | Direct write |
| **Pattern** | Recurring behaviors observed across sessions | High stakes → proposals |

## Vault Structure

```
vault/
├── projects/{project}/     # Per-project knowledge
├── _global/                # Cross-project knowledge
├── _system/                # Vault metadata and indexes
└── _proposals/             # High-stakes items pending review
    └── _archived/          # Rejected proposals (preserved)
```

## Development

This package lives in `tpcw-build/pi-tpcw/` during development. To test:

```bash
# Test the extension directly
pi -e ./pi-tpcw/extensions/vault-guard

# Test with the full package
pi install ./pi-tpcw
```

## License

MIT
