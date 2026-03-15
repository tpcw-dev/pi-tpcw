---
name: vault-todo
description: Vault todo lifecycle management. Use when starting work on a task, finishing a task, or needing to check/create vault todos. Triggers on "pick up a todo", "start working on", "mark as review", "check vault todos", or any vault todo stage transition.
---

# Vault Todo Lifecycle

## Before Starting Any Work

1. **Search for existing todos:**
   ```
   mcp({ tool: "vault_search_notes", args: '{"query": "<your task topic>", "searchFrontmatter": true, "limit": 10}' })
   ```

2. **If a matching todo exists**, update its stage:
   ```
   mcp({ tool: "vault_update_frontmatter", args: '{"path": "<todo-path>", "frontmatter": {"stage": "in-progress"}}' })
   ```

3. **If NO matching todo exists** and the task is significant, create one:
   ```
   mcp({ tool: "vault_write_note", args: '{"path": "projects/<project>/short-slug.md", "content": "---\nid: todo-<project>-<slug>-<date>\ntype: todo\nproject: <project>\nstatus: active\ncreated: <YYYY-MM-DD>\nconfidence: high\ntags: []\nrelated: []\nsource-session: pi-session-<date>\npriority: medium\nassignee: \"\"\ndue: \"\"\nstage: in-progress\neffort: medium\n---\n\n# Title\n\nDescription of what needs to be done.\n\n## Scope\n\n- [ ] Task 1\n- [ ] Task 2\n"}' })
   ```

## After Finishing Work

Update the todo stage to `review`:
```
mcp({ tool: "vault_update_frontmatter", args: '{"path": "<todo-path>", "frontmatter": {"stage": "review"}}' })
```

**Important:** Never set stage to `done` — that requires human approval.

## Stage Lifecycle

```
backlog → in-progress → review → done
  │            │           │        │
  │            │           │        └── Human approved
  │            │           └── Agent finished, awaiting review
  │            └── Agent actively working
  └── Not started (default)
```

## Rules

- ALWAYS search vault before creating new todos (avoid duplicates)
- ALWAYS use MCP vault tools (never edit vault files directly)
- ALWAYS update stage transitions (don't skip stages)
- Keep todo scope focused — one todo per deliverable
