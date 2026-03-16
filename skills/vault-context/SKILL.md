---
name: vault-context
description: Onboard a project into the vault by scanning existing artifacts — README, docs, package files, configs — extracting knowledge (decisions, lessons, todos, ideas, patterns) and writing them through vault-update. Triggers on "onboard project", "context init", "scan project for knowledge", "add project context to vault", "initialize context".
---

# Vault Context — Project Onboarding

Onboard a project into the vault by scanning its existing artifacts, extracting knowledge objects, and feeding them through the vault-update skill as the shared write layer.

## Prerequisites

- Vault must be initialized (`_system/_master-index.md` exists)
- Project must exist in vault (`projects/{project}/_project-index.md` exists)
- If either is missing, tell the user to run `vault-init` first

## Inputs

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `project` | ✅ YES | — | Kebab-case project name |
| `project_path` | ✅ YES | cwd | Path to the project directory |
| `scan_depth` | No | `3` | How deep to recurse |
| `confidence_threshold` | No | `low` | Minimum confidence to include |

If `project` is missing, ask for it. Validate it's kebab-case.

---

## Phase 1: Scan Project Files

Use `find` to discover knowledge-bearing files. **Do NOT read file contents yet — discovery only.**

### High-Priority Files (Tier 1 — always scan)

| Pattern | Category |
|---------|----------|
| `README.md`, `README.*` | readme |
| `DESIGN.md`, `ARCHITECTURE.md` | design |
| `TODO.md`, `ROADMAP.md`, `CHANGELOG.md` | planning |
| `docs/**/*.md` | documentation |
| `package.json`, `Cargo.toml`, `pyproject.toml` | package |
| `.bmad-output/**/*.md`, `_bmad-output/**/*.md` | bmad |

### Medium-Priority Files (Tier 2)

| Pattern | Category |
|---------|----------|
| `*.spec.md` | specs |
| `config.yaml`, `*.config.*` | config |
| `.env.example` | config |
| `Makefile`, `Justfile`, `Taskfile.yml` | build |
| `docker-compose.yml`, `Dockerfile` | infra |

### Exclusions (always skip)

`node_modules/`, `vendor/`, `.git/`, `dist/`, `build/`, `target/`, `*.lock`, binary files, `_bmad/core/`, test fixtures, generated API docs.

### Scan Command

```bash
find {project_path} -maxdepth {scan_depth} -type f \
  \( -name "*.md" -o -name "*.yaml" -o -name "*.yml" \
     -o -name "*.json" -o -name "*.toml" -o -name "*.cfg" \
     -o -name "Makefile" -o -name "Justfile" -o -name "Dockerfile" \
     -o -name "docker-compose*" -o -name ".env.example" \) \
  ! -path "*/node_modules/*" ! -path "*/.git/*" \
  ! -path "*/dist/*" ! -path "*/build/*" ! -path "*/target/*" \
  ! -path "*/vendor/*" ! -path "*/_bmad/core/*" \
  | sort
```

Categorize each file and sort into Tier 1/2/3. If zero scannable files, halt.

---

## Phase 2: Extract Knowledge

Read files in tier order (Tier 1 first). For each file, use extraction patterns to find knowledge-bearing passages.

### Extraction Patterns

**README / Design Docs:** Architecture statements ("We use X for Y"), technology choices with rationale, design principles, trade-off discussions, setup requirements implying infra decisions.

**BMAD Artifacts (PRDs, Specs, Brainstorms):** Requirements that became decisions, architecture from PRD, rejected alternatives, open questions (→ todos/ideas), brainstorm outputs.

**TODO / Roadmap / Changelog:** Open items (→ todos), completed items with context (→ decisions/lessons), milestones (→ ideas/todos), breaking changes (→ decisions).

**Package / Config Files:** Key dependencies (→ architectural decisions), scripts/commands (→ workflow decisions), config structure.

**Spec Files:** Agent/workflow design, implementation notes, planned features (→ todos/ideas).

### What to Skip

Boilerplate docs (license, contributing), generated API docs, test fixtures, generic README sections unless they contain decisions.

### Dedup Within Project

Remove cross-file duplicates — same decision in README and PRD → keep the more detailed version.

Each extraction becomes:
```
{
  raw_content: "the extracted text",
  source_file: "relative/path/to/file.md",
  source_category: "readme|design|planning|documentation|bmad|specs|config|infra|package",
  priority: "high|medium",  // Tier 1 = high, Tier 2/3 = medium
  project: "{project}"
}
```

---

## Phase 3: Classify Extractions

Categorize each extraction by content type and assign confidence.

### Content Type Rules

| Type | Signals | Common Sources |
|------|---------|----------------|
| `decision` | decided, chose, selected, approach, trade-off, "use X for Y" | README, DESIGN, BMAD PRDs |
| `lesson` | learned, realized, discovered, mistake, gotcha | Docs, changelogs |
| `idea` | idea, proposal, "what if", "could we", explore | Brainstorms, roadmap |
| `todo` | todo, task, "need to", "should", fix, implement | TODO.md, specs |
| `pattern` | pattern, recurring, always, convention, standard | Docs, conventions files |

**Ambiguous cases:** Prefer `decision` > `lesson`, `todo` > `idea`, `lesson` > `idea`. Default to `lesson` if unclassifiable.

### Confidence Assignment

| Source Category | Default Confidence |
|----------------|-------------------|
| `readme`, `design`, `bmad` | `high` |
| `planning`, `documentation`, `specs` | `medium` |
| `config`, `package`, `infra` | `low` |

Adjust up if content includes explicit rationale. Adjust down if vague or potentially outdated.

### Cross-Project Detection

Flag as global (`_global/`) if:
- Content applies across multiple projects
- Content explicitly mentions being general/universal
- Type is `pattern` (patterns are cross-project by default)

### Apply Confidence Threshold

Drop extractions below the `confidence_threshold`. Default is `low` (include everything).

---

## Phase 4: Structure for Vault Update

Transform each classified extraction into a structured object:

```yaml
content: "{polished, self-contained text}"
project: "{project}"
source-session: "context-init-{project}-{YYYY-MM-DD}"
type: "{decision|lesson|idea|todo|pattern}"
confidence: "{high|medium|low}"
skip_proposals: false
skip_commit: true  # true for all except the last extraction
```

### Content Polishing

- Remove documentation boilerplate
- Make self-contained (add context implied by the source file)
- Clean, direct prose: 2-6 sentences for most, shorter for todos
- Include source attribution: `(Source: README.md)`

### Processing Order

1. High confidence first
2. Decisions before other types
3. Global items grouped together
4. Last item should be low-risk (triggers the commit)

---

## Phase 5: Feed Through Vault Update

For each structured extraction, invoke the vault-update skill logic:

1. **Dedup check** — search vault for similar content via `obsidian vault="<vault>" search query="..." format=json`
2. **Classify & tag** — refine type, generate 2-5 kebab-case tags, determine target location
3. **Write** — build frontmatter (base + type-specific), write via `obsidian vault="<vault>" create ... overwrite silent`
4. **Validate** — read back and verify schema compliance, auto-fix issues
5. **Index** — regenerate project index and master index
6. **Commit** — git add + commit (only on the last extraction)

Track outcomes per extraction: `written`, `deduped`, `proposed`, `failed`.

Continue on individual failures — don't halt the pipeline.

---

## Phase 6: Summary Report

```
📊 Context Initialization Complete
═══════════════════════════════════

Project: {project}
Path: {project_path}
Vault: {vault_path}

Scan Results:
  files discovered: {count}
  files read: {count}

Extraction Results:
  raw extractions: {raw_count}
  after dedup/filtering: {classified_count}

Vault Results:
  ✅ Written: {written_count}
  🔄 Deduped: {deduped_count}
  📋 Proposed: {proposed_count}
  ❌ Failed: {failed_count}

Written entries:
  - {vault_path_1}
  - {vault_path_2}

═══════════════════════════════════
```

### Next Steps

- If proposals created: "Run vault-review to approve or reject proposals."
- If todos extracted: "Check the vault Kanban view to prioritize new todos."
- General: "The project is now onboarded. The vault will grow as you work."

## Rules

- ALWAYS scan before reading — don't read every file blindly
- ALWAYS extract selectively — not every sentence is vault-worthy
- ALWAYS go through vault-update for writes — never write directly
- NEVER halt the pipeline for individual write failures
- ALWAYS output the summary report at the end
