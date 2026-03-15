---
name: vault-todo
description: Vault todo lifecycle management. Use when starting work on a task, finishing a task, or needing to check/create vault todos. Triggers on "pick up a todo", "start working on", "mark as review", "check vault todos", or any vault todo stage transition.
---

# Vault Todo Lifecycle

## Before Starting Any Work

1. **Search for existing todos:**
   ```bash
   obsidian vault="<vault>" search query="<your task topic>" format=json
   ```

2. **Search by frontmatter** (e.g., find all in-progress todos):
   ```bash
   obsidian vault="<vault>" eval code="JSON.stringify(app.vault.getMarkdownFiles().filter(f=>{const fm=app.metadataCache.getFileCache(f)?.frontmatter;return fm?.type==='todo'&&fm?.stage==='in-progress'}).map(f=>({path:f.path,name:f.basename,priority:app.metadataCache.getFileCache(f).frontmatter.priority})))"
   ```

3. **If a matching todo exists**, update its stage:
   ```bash
   obsidian vault="<vault>" property:set file="<todo-name>" name="stage" value="in-progress"
   ```

4. **If NO matching todo exists** and the task is significant, create one:
   ```bash
   obsidian vault="<vault>" create path="projects/<project>/short-slug.md" content="---
   id: todo-<project>-<slug>-<date>
   type: todo
   project: <project>
   status: active
   created: <YYYY-MM-DD>
   confidence: high
   tags: []
   related: []
   source-session: pi-session-<date>
   priority: medium
   assignee: \"\"
   due: \"\"
   stage: in-progress
   effort: medium
   ---

   # Title

   Description of what needs to be done.

   ## Scope

   - [ ] Task 1
   - [ ] Task 2
   "
   ```

5. **Read a todo:**
   ```bash
   obsidian vault="<vault>" read file="<todo-name>"
   ```

## After Finishing Work

Update the todo stage to `review`:
```bash
obsidian vault="<vault>" property:set file="<todo-name>" name="stage" value="review"
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
- ALWAYS use Obsidian CLI via bash (never edit vault files directly)
- ALWAYS update stage transitions (don't skip stages)
- Keep todo scope focused — one todo per deliverable
