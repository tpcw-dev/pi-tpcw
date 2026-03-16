---
name: vault-init
description: Initialize a new TPCW knowledge vault from scratch, or onboard a new project into an existing vault. Triggers on "init vault", "create vault", "new vault", "add project to vault", "onboard project". Two modes — Full Init (creates everything) and Add Project (adds project to existing vault).
---

# Vault Init

Initialize a fully operational knowledge vault — folder structure, system files, Obsidian `.base` views, project scaffolding, master index, and git — or onboard a new project into an existing vault.

## Inputs

| Field | Required | Source | Description |
|-------|----------|--------|-------------|
| `project` | ✅ YES | User input | Kebab-case project name (e.g. `tpcw-build`) |
| `project_display_name` | Optional | User input | Defaults to titlecase of `project` |
| `vault_path` | ✅ YES | Config | Absolute path to the knowledge vault |

If `project` is missing, ask: *"What is the project name? (kebab-case, e.g. `tpcw-build`)"*

Validate `project` is kebab-case (lowercase, hyphens only, no spaces or special chars). If invalid, halt with error.

## Mode Detection

Detect mode automatically from vault state — never ask the user.

**Full Init** — `{vault_path}/_system/_master-index.md` does NOT exist:
→ Create everything from scratch

**Add Project** — `{vault_path}/_system/_master-index.md` EXISTS:
→ Check if `{vault_path}/projects/{project}/` already exists
  - If yes → abort: *"⚠️ Project '{project}' already exists. Use vault-update to add entries."*
  - If no → Create project-specific artifacts only and update master index

---

## Phase 1: Create Folder Structure

Use `mkdir -p` (idempotent) via bash.

### Full Init — create complete hierarchy:

```bash
mkdir -p "{vault_path}/projects/{project}"
mkdir -p "{vault_path}/_global"
mkdir -p "{vault_path}/_system"
mkdir -p "{vault_path}/_proposals"
```

Vault folder structure:
```
vault/
├── projects/{project}/     # Project-specific knowledge entries
├── _global/                # Cross-project knowledge
├── _system/                # Vault metadata (master index, vault rules)
└── _proposals/             # Entries awaiting review
```

### Add Project — project folder only:

```bash
mkdir -p "{vault_path}/projects/{project}"
```

Verify all expected directories exist before proceeding.

---

## Phase 2: Create System Files (Full Init Only)

> **Add Project mode:** Skip this phase entirely — system files already exist.

### 2a. Write vault-rules.md via Obsidian CLI

```bash
obsidian vault="{vault_name}" create path="_system/vault-rules.md" content="---
description: Core vault rules and conventions
last-updated: <YYYY-MM-DD>
---
<content>" overwrite silent 2>/dev/null
```

Content for vault-rules.md — a condensed quick-reference covering:

- **Flat structure:** Use frontmatter (type/project/tags) for organization, not deep nesting
- **File naming:** kebab-case, no dates in filenames (dates live in frontmatter ID)
- **Frontmatter requirements:** All entries need base fields (id, type, project, status, created, confidence, tags, related, source-session) plus type-specific extensions
- **Entry types:** decision, lesson, idea, todo, pattern, component, workflow, architecture — each has specific extension fields
- **Trust routing:** High confidence → direct write to project folder. Low confidence → `_proposals/` for review
- **Git commit format:** `vault: {action} - {summary}` (actions: add, update, flag, index, batch)
- **Base files:** `.base` files are Obsidian UI views querying frontmatter dynamically — they don't need updating when entries are added
- **ID format:** `{type}-{project}-{short-slug}-{YYYYMMDD}`
- **Idempotency:** Dedup before write. Index regeneration rebuilds from current state. Git commit only if staged changes exist.

### 2b. Write .gitignore via filesystem

Write `{vault_path}/.gitignore` via bash or Write tool (NOT Obsidian CLI):

```
.obsidian/
.trash/
```

---

## Phase 3: Create Project Index (Both Modes)

Write `projects/{project}/_project-index.md` via Obsidian CLI:

```bash
obsidian vault="{vault_name}" create path="projects/{project}/_project-index.md" content="---
project: {project}
last-updated: <YYYY-MM-DD>
entry-count: 0
---
# {project_display_name} — Vault Index

## Architecture (0)

## Components (0)

## Workflows (0)

## Decisions (0)

## Lessons (0)

## Todos (0)

## Ideas (0)

## Patterns (0)" overwrite silent 2>/dev/null
```

The index starts empty. It is maintained by vault-update as entries are added.

---

## Phase 4: Create Obsidian Base Files

> ⚠️ **Base files are YAML, not markdown.** Write them via filesystem tools (Write tool or `cat >`), NEVER via Obsidian CLI.

### Full Init — create all three base files:

#### 4a. todos.base — Global todo Kanban board

Write `{vault_path}/todos.base`:

```yaml
filters:
  and:
    - 'type == "todo"'
    - 'status == "active"'

formulas:
  days_until_due: 'if(due, (date(due) - today()).days, "")'
  is_overdue: 'if(due, date(due) < today(), false)'

properties:
  file.name:
    displayName: "Task"
  project:
    displayName: "Project"
  priority:
    displayName: "Priority"
  effort:
    displayName: "Effort"
  formula.days_until_due:
    displayName: "Days Until Due"

views:
  - type: table
    name: "Kanban"
    groupBy:
      property: stage
      direction: ASC
    order:
      - file.name
      - project
      - priority
      - effort
      - formula.days_until_due
  - type: table
    name: "By Priority"
    groupBy:
      property: priority
      direction: DESC
    order:
      - file.name
      - project
      - stage
      - effort
```

#### 4b. dashboard.base — Vault overview dashboard

Write `{vault_path}/dashboard.base`:

```yaml
filters:
  and:
    - 'status == "active"'
    - 'file.name != "_project-index"'
    - 'file.name != "_master-index"'
    - 'file.name != "vault-rules"'

formulas:
  age_days: '(today() - date(created)).days'

properties:
  file.name:
    displayName: "Entry"
  type:
    displayName: "Type"
  project:
    displayName: "Project"
  confidence:
    displayName: "Confidence"
  formula.age_days:
    displayName: "Age (days)"

views:
  - type: table
    name: "All Entries"
    groupBy:
      property: project
      direction: ASC
    order:
      - file.name
      - type
      - confidence
      - tags
      - formula.age_days
  - type: table
    name: "By Type"
    groupBy:
      property: type
      direction: ASC
    order:
      - file.name
      - project
      - confidence
      - created
```

### Both Modes — create project-specific base file:

#### 4c. project-{project}.base — Project filtered view

Write `{vault_path}/project-{project}.base`:

```yaml
filters:
  and:
    - 'project == "{project}"'
    - 'status == "active"'

formulas:
  days_until_due: 'if(due, (date(due) - today()).days, "")'

properties:
  file.name:
    displayName: "Entry"
  type:
    displayName: "Type"
  stage:
    displayName: "Stage"
  priority:
    displayName: "Priority"
  formula.days_until_due:
    displayName: "Due In"

views:
  - type: table
    name: "All"
    groupBy:
      property: type
      direction: ASC
    order:
      - file.name
      - stage
      - priority
      - tags
  - type: table
    name: "Todos"
    filters:
      and:
        - 'type == "todo"'
    groupBy:
      property: stage
      direction: ASC
    order:
      - file.name
      - priority
      - effort
      - formula.days_until_due
```

Verify all created `.base` files exist and are non-empty.

---

## Phase 5: Create / Update Master Index

### Full Init — create master index from scratch:

```bash
obsidian vault="{vault_name}" create path="_system/_master-index.md" content="---
last-updated: <YYYY-MM-DD>
project-count: 1
total-entries: 0
---
# Vault Master Index

## Projects
- [[projects/{project}/_project-index|{project}]] — 0 entries

## Global Knowledge
- 0 entries" overwrite silent 2>/dev/null
```

### Add Project — update existing master index:

1. Read the existing master index via `obsidian vault="{vault_name}" read` / `obsidian vault="{vault_name}" properties ... format=json`
2. Update frontmatter: increment `project-count`, update `last-updated`
3. Append new project line under `## Projects`: `- [[projects/{project}/_project-index|{project}]] — 0 entries`
4. Preserve all existing content
5. Write back via `obsidian vault="{vault_name}" create path="..." content="..." overwrite silent`

---

## Phase 6: Git Init & Commit

> Git is a bonus, not a gate. If git fails, log a warning and continue — vault files are already written.

### Full Init:

```bash
cd "{vault_path}"
git init
git add .
git commit -m "vault: init - {project} vault with base files"
```

### Add Project:

```bash
cd "{vault_path}"
git add .
git diff --cached --quiet || git commit -m "vault: add-project - {project} scaffolding and base file"
```

Capture the commit hash for the summary report.

---

## Phase 7: Summary Report

Output a final report confirming everything created.

### Full Init Report:

```
═══════════════════════════════════════
  VAULT INIT: Full Init Complete
═══════════════════════════════════════

  Vault:      {vault_path}
  Project:    {project} ({project_display_name})
  Mode:       full

  Folders:    projects/{project}/, _global/, _system/, _proposals/
  System:     _system/vault-rules.md, .gitignore
  Project:    projects/{project}/_project-index.md
  Bases:      todos.base, dashboard.base, project-{project}.base
  Index:      _system/_master-index.md (1 project, 0 entries)
  Git:        {✓ initialized ({hash}) | ⚠️ failed — commit manually}

  Next Steps:
    - Open vault in Obsidian to see base views
    - Run vault-update to add knowledge entries
    - Run vault-scan to capture session knowledge
═══════════════════════════════════════
```

### Add Project Report:

```
═══════════════════════════════════════
  VAULT INIT: Add Project Complete
═══════════════════════════════════════

  Vault:      {vault_path}
  Project:    {project} ({project_display_name})
  Mode:       add-project

  Project:    projects/{project}/_project-index.md
  Bases:      project-{project}.base
  Index:      _system/_master-index.md updated ({project_count} projects)
  Git:        {✓ committed ({hash}) | ⚠️ failed — commit manually}

  Next Steps:
    - Open project-{project}.base in Obsidian
    - Run vault-update to add entries for {project}
    - Global bases (todos, dashboard) auto-include new project
═══════════════════════════════════════
```

## Rules

- ALWAYS detect mode from vault state — never ask the user which mode
- ALWAYS use Obsidian CLI for `.md` files, filesystem tools for `.base` and `.gitignore`
- ALWAYS validate project name is kebab-case before proceeding
- NEVER overwrite existing system files in Add Project mode
- NEVER fail the pipeline on git errors — files are already safe
- ALWAYS output the summary report at the end
