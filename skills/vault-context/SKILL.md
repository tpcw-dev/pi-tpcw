---
name: vault-context
description: Onboard a project into the vault by scanning existing artifacts — README, docs, package files, configs, and source code — extracting knowledge through parallel specialized subagents and writing results through vault-update. Triggers on "onboard project", "context init", "scan project for knowledge", "add project context to vault", "initialize context".
---

# Vault Context — Project Onboarding (Orchestrator)

Onboard a project into the vault by spawning three specialized subagents in parallel to extract different kinds of knowledge, then merging, classifying, and feeding results through vault-update.

## Prerequisites

- Vault must be initialized (`_system/_master-index.md` exists)
- Project must exist in vault (`projects/{project}/_project-index.md` exists)
- If either is missing, tell the user to run `vault-init` first

## Inputs

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `project` | ✅ YES | — | Kebab-case project name |
| `project_path` | ✅ YES | cwd | Path to the project directory |
| `scan_depth` | No | `3` | How deep to recurse for discovery |
| `confidence_threshold` | No | `low` | Minimum confidence to include |

If `project` is missing, ask for it. Validate it's kebab-case.

---

## Phase 1: Discovery (In-Skill — Sequential)

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
| `.pi/agents/*.md` | agents |
| `skills/*/SKILL.md` | skills |

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

Categorize each file into Tier 1/2 and by category. Also identify source directories:

```bash
# Find source code directories for codebase-scanner
find {project_path} -maxdepth 2 -type d \
  \( -name "src" -o -name "lib" -o -name "app" -o -name "cmd" -o -name "pkg" \) \
  ! -path "*/node_modules/*" ! -path "*/.git/*" 2>/dev/null

# Detect primary language
ls {project_path}/package.json {project_path}/tsconfig.json {project_path}/pyproject.toml \
   {project_path}/Cargo.toml {project_path}/go.mod 2>/dev/null
```

If zero scannable files, halt.

### Prepare Subagent Inputs

Split the discovered files into three groups:

| Subagent | Gets These Files | Purpose |
|----------|-----------------|---------|
| **structure-analyzer** | All files (full inventory) + dir tree | Components, relationships, boundaries |
| **knowledge-extractor** | Tier 1 + Tier 2 documentation files only | Decisions, lessons, patterns, ideas, todos |
| **codebase-scanner** | Source directories + entry points | Module graph, workflows, state machines, API surface |

---

## Phase 2: Parallel Extraction (Subagents — Concurrent)

Spawn all three subagents in parallel using the `subagent` tool's parallel mode:

```json
{
  "tasks": [
    {
      "agent": "structure-analyzer",
      "task": "Analyze project structure and extract components, relationships, and boundaries.\n\n## Project\n- Name: {project}\n- Path: {project_path}\n\n## File Inventory\n{categorized file list with tiers}\n\n## Output Path\n/tmp/vault-context-structure-{project}.md"
    },
    {
      "agent": "knowledge-extractor",
      "task": "Extract knowledge objects from project documentation.\n\n## Project\n- Name: {project}\n- Path: {project_path}\n\n## Files to Read\n### Tier 1 (High Priority)\n{tier_1_files}\n\n### Tier 2 (Medium Priority)\n{tier_2_files}\n\n## Output Path\n/tmp/vault-context-knowledge-{project}.md"
    },
    {
      "agent": "codebase-scanner",
      "task": "Scan source code to discover modules, workflows, entry points, and data flows.\n\n## Project\n- Name: {project}\n- Path: {project_path}\n- Primary language: {detected_language}\n- Source directories: {src_dirs}\n\n## Output Path\n/tmp/vault-context-codebase-{project}.md"
    }
  ],
  "mode": "spawn"
}
```

Wait for all three to complete. Verify each output file exists:

```bash
test -f /tmp/vault-context-structure-{project}.md && echo "✓ structure" || echo "✗ structure MISSING"
test -f /tmp/vault-context-knowledge-{project}.md && echo "✓ knowledge" || echo "✗ knowledge MISSING"
test -f /tmp/vault-context-codebase-{project}.md && echo "✓ codebase" || echo "✗ codebase MISSING"
```

If any subagent failed, log the gap and continue with what succeeded. Never halt the pipeline for a single subagent failure.

---

## Phase 3: Merge & Classify (In-Skill — Sequential)

Read all three output files and merge into a unified extraction list.

### 3a. Read Subagent Outputs

```bash
cat /tmp/vault-context-structure-{project}.md
cat /tmp/vault-context-knowledge-{project}.md
cat /tmp/vault-context-codebase-{project}.md
```

### 3b. Transform Structure Analysis → Vault Entries

The structure-analyzer produces components and relationships. Transform these into vault entries:

**Components → `pattern` entries:**
Each significant component (not every file, but each architectural unit) becomes a pattern entry:
```
Type: pattern
Content: "{Component Name} — {role}. Located at {location}. {what it exposes}. {what it depends on}."
Confidence: high (from structural analysis)
Tags: [architecture, component, {component-type}]
```

**Relationships → `pattern` entries:**
Group related relationships into coherent pattern entries:
```
Type: pattern
Content: "The {system/subsystem} uses a {pattern name} pattern: {A} → {B} → {C}. {A} {relationship} {B}, which {relationship} {C}. (Source: structural analysis)"
Confidence: high
Tags: [architecture, data-flow|dependency|orchestration]
```

**Boundaries → `pattern` entries:**
```
Type: pattern
Content: "System boundary: {description of what's internal vs external, layers if present}. (Source: structural analysis)"
Confidence: medium
Tags: [architecture, boundary]
```

### 3c. Transform Codebase Analysis → Vault Entries

**Workflows/Pipelines → `pattern` entries:**
```
Type: pattern
Content: "{Workflow name}: {step-by-step description with file references}. (Source: codebase scan)"
Confidence: medium
Tags: [workflow, {relevant-tags}]
```

**State Machines → `pattern` entries:**
```
Type: pattern
Content: "{Entity} lifecycle: states [{list}], transitions [{from → to triggered by action}]. (Source: codebase scan)"
Confidence: medium
Tags: [state-machine, lifecycle]
```

**API Surface → `pattern` entries:**
```
Type: pattern
Content: "API surface: {list of endpoints/commands with descriptions}. (Source: codebase scan)"
Confidence: medium
Tags: [api, interface]
```

**Undocumented discoveries → `lesson` entries:**
```
Type: lesson
Content: "{description of code-doc divergence}. (Source: codebase scan)"
Confidence: medium
Tags: [code-doc-gap, {relevant-tags}]
```

### 3d. Knowledge Extractions → Direct Pass-Through

The knowledge-extractor already produces classified entries. Pass them through with minimal transformation — they already have type, confidence, and source attribution.

### 3e. Cross-Source Dedup

The same knowledge may appear in multiple subagent outputs (structure-analyzer finds a component, knowledge-extractor reads about it in README). Deduplicate:

- **Same entity, different detail levels** → keep the richer version, merge source attribution
- **Same decision from docs and code** → keep the docs version (has rationale), add code confirmation
- **Structural pattern also described in README** → merge into one, cite both sources

### 3f. Apply Confidence Threshold

Drop extractions below the `confidence_threshold`. Default is `low` (include everything).

### 3g. Order for Writing

1. High confidence first
2. Patterns before other types (structural knowledge first — it provides context for everything else)
3. Decisions next (architectural choices)
4. Lessons, ideas, todos last
5. Last item should be low-risk (triggers the git commit)

---

## Phase 4: Feed Through Vault Update

For each merged extraction, invoke the vault-update skill logic:

1. **Dedup check** — search vault for similar content via `obsidian vault="<vault>" search query="..." format=json`
2. **Classify & tag** — refine type, generate 2-5 kebab-case tags, determine target location
3. **Write** — build frontmatter (base + type-specific), write via `obsidian vault="<vault>" create ... overwrite silent`
4. **Validate** — read back and verify schema compliance, auto-fix issues
5. **Index** — regenerate project index and master index
6. **Commit** — git add + commit (only on the last extraction)

Each extraction becomes:
```yaml
content: "{polished, self-contained text}"
project: "{project}"
source-session: "context-init-{project}-{YYYY-MM-DD}"
type: "{decision|lesson|idea|todo|pattern}"
confidence: "{high|medium|low}"
skip_proposals: false
skip_commit: true  # true for all except the last extraction
```

Track outcomes per extraction: `written`, `deduped`, `proposed`, `failed`.

Continue on individual failures — don't halt the pipeline.

---

## Phase 5: Summary Report

```
📊 Context Initialization Complete
═══════════════════════════════════

Project: {project}
Path: {project_path}
Vault: {vault_path}

Discovery:
  files found:          {count}
  source dirs found:    {count}

Subagent Results:
  structure-analyzer:   {✓ complete | ✗ failed}
    components:         {count}
    relationships:      {count}
  knowledge-extractor:  {✓ complete | ✗ failed}
    raw extractions:    {count}
  codebase-scanner:     {✓ complete | ✗ failed}
    entry points:       {count}
    workflows:          {count}
    state machines:     {count}

Merge Results:
  total extractions:    {count}
  after dedup:          {count}
  by type:
    patterns:           {count}  (structural + conventions)
    decisions:          {count}
    lessons:            {count}
    ideas:              {count}
    todos:              {count}

Vault Results:
  ✅ Written:           {count}
  🔄 Deduped:          {count}
  📋 Proposed:         {count}
  ❌ Failed:           {count}

Written entries:
  - {vault_path_1}
  - {vault_path_2}
  ...

═══════════════════════════════════
```

### Next Steps

- If proposals created: "Run vault-review to approve or reject proposals."
- If todos extracted: "Check the vault Kanban view to prioritize new todos."
- For diagrams: "The vault now has structural context. Run vault-diagram to visualize."
- General: "The project is now onboarded. The vault will grow as you work."

---

## Rules

- ALWAYS run discovery before spawning subagents — they need the file inventory
- ALWAYS spawn all three subagents in parallel — don't serialize what can be concurrent
- ALWAYS continue the pipeline if one subagent fails — partial results are better than none
- ALWAYS transform structural/codebase findings into typed vault entries (pattern, lesson, etc.)
- ALWAYS cross-source dedup before writing — the same knowledge often appears in docs AND code
- ALWAYS go through vault-update for writes — never write vault entries directly
- ALWAYS prioritize patterns first in write order — structural context helps everything else
- NEVER halt the pipeline for individual write failures
- NEVER skip the merge phase — raw subagent output is not vault-ready
- NEVER read source files directly in this skill — that's the subagents' job
- ALWAYS output the summary report at the end
