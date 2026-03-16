---
name: vault-context
description: Onboard a project into the vault by scanning existing artifacts — README, docs, package files, configs, and source code — extracting knowledge through parallel specialized subagents and writing results through vault-update. Triggers on "onboard project", "context init", "scan project for knowledge", "add project context to vault", "initialize context".
---

# Vault Context — Project Onboarding (Orchestrator)

Pure orchestrator. Spawns vault-scout for reconnaissance, then three specialized extraction subagents in parallel, then merges results and feeds through vault-update. Does no file reading or analysis itself.

## Prerequisites

- Vault must be initialized (`_system/_master-index.md` exists)
- Project must exist in vault (`projects/{project}/_project-index.md` exists)
- If either is missing, tell the user to run `vault-init` first

## Inputs

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `project` | ✅ YES | — | Kebab-case project name |
| `project_path` | ✅ YES | cwd | Path to the project directory |
| `vault_name` | No | `tpcw-vault` | Obsidian vault name |
| `scan_depth` | No | `3` | How deep to recurse for discovery |
| `confidence_threshold` | No | `low` | Minimum confidence to include |

If `project` is missing, ask for it. Validate it's kebab-case.

---

## Phase 1: Reconnaissance (vault-scout)

Delegate all discovery to vault-scout. It scans both the project filesystem AND existing vault entries for this project, producing a unified context block.

```json
{
  "agent": "vault-scout",
  "task": "Gather context for project onboarding.\n\n## Domain\n{project} project — full structural and knowledge reconnaissance for vault onboarding\n\n## Scope\n- Vault: {vault_name}\n- Project: {project} at {project_path}\n- Scan depth: {scan_depth}\n\n## Output Path\n/tmp/vault-scout-{project}.md",
  "mode": "spawn"
}
```

After vault-scout completes, read the scout report:

```bash
test -f /tmp/vault-scout-{project}.md && echo "✓ scout report ready" || echo "✗ scout report MISSING"
cat /tmp/vault-scout-{project}.md
```

The scout report contains:
- **Project Shape** — archetype, language, framework, entry points, source directories
- **File Inventory** — Tier 1/2 files categorized by type
- **Annotated File Tree** — directory structure with annotations
- **Existing Vault Entries** — what the vault already knows about this project
- **Gaps** — what's missing

If vault-scout fails, halt — the extraction subagents need the inventory to work.

---

## Phase 2: Parallel Extraction (3 Subagents)

Extract the file inventory, source directories, and project shape from the scout report. Then spawn all three extraction subagents in parallel:

```json
{
  "tasks": [
    {
      "agent": "structure-analyzer",
      "task": "Analyze project structure and extract components, relationships, and boundaries.\n\n## Project\n- Name: {project}\n- Path: {project_path}\n\n## Scout Report (pre-built inventory)\n{paste relevant sections: Project Shape, File Inventory, Annotated File Tree}\n\n## Output Path\n/tmp/vault-context-structure-{project}.md"
    },
    {
      "agent": "knowledge-extractor",
      "task": "Extract knowledge objects from project documentation.\n\n## Project\n- Name: {project}\n- Path: {project_path}\n\n## Files to Read (from scout report)\n### Tier 1 (High Priority)\n{tier_1_files from scout report}\n\n### Tier 2 (Medium Priority)\n{tier_2_files from scout report}\n\n## Output Path\n/tmp/vault-context-knowledge-{project}.md"
    },
    {
      "agent": "codebase-scanner",
      "task": "Scan source code to discover modules, workflows, entry points, and data flows.\n\n## Project\n- Name: {project}\n- Path: {project_path}\n- Primary language: {from scout report}\n- Source directories: {from scout report}\n\n## Output Path\n/tmp/vault-context-codebase-{project}.md"
    }
  ],
  "mode": "spawn"
}
```

Wait for all three to complete. Verify each output:

```bash
test -f /tmp/vault-context-structure-{project}.md && echo "✓ structure" || echo "✗ structure MISSING"
test -f /tmp/vault-context-knowledge-{project}.md && echo "✓ knowledge" || echo "✗ knowledge MISSING"
test -f /tmp/vault-context-codebase-{project}.md && echo "✓ codebase" || echo "✗ codebase MISSING"
```

If any subagent failed, log the gap and continue with what succeeded. Never halt the pipeline for a single extraction failure.

---

## Phase 3: Merge & Classify (In-Skill)

Read all subagent outputs and the scout report's existing vault entries section. Merge into a unified extraction list.

### 3a. Read Outputs

```bash
cat /tmp/vault-context-structure-{project}.md
cat /tmp/vault-context-knowledge-{project}.md
cat /tmp/vault-context-codebase-{project}.md
```

### 3b. Transform Structure Analysis → Vault Entries

**Components → `pattern` entries:**
Each significant component becomes a pattern entry:
```
Type: pattern
Content: "{Component Name} — {role}. Located at {location}. Exposes: {what}. Depends on: {what}."
Confidence: high
Tags: [architecture, component, {component-type}]
```

**Relationships → `pattern` entries:**
Group related relationships into coherent entries:
```
Type: pattern
Content: "The {system/subsystem} uses a {pattern name}: {A} → {B} → {C}. {description of flow}. (Source: structural analysis)"
Confidence: high
Tags: [architecture, data-flow|dependency|orchestration]
```

**Boundaries → `pattern` entries:**
```
Type: pattern
Content: "System boundary: {internal vs external, layers}. (Source: structural analysis)"
Confidence: medium
Tags: [architecture, boundary]
```

### 3c. Transform Codebase Analysis → Vault Entries

**Workflows/Pipelines → `pattern` entries:**
```
Type: pattern
Content: "{Workflow name}: {step-by-step with file references}. (Source: codebase scan)"
Confidence: medium
Tags: [workflow, {relevant-tags}]
```

**State Machines → `pattern` entries:**
```
Type: pattern
Content: "{Entity} lifecycle: states [{list}], transitions [{from → to}]. (Source: codebase scan)"
Confidence: medium
Tags: [state-machine, lifecycle]
```

**API Surface → `pattern` entries:**
```
Type: pattern
Content: "API surface: {endpoints/commands}. (Source: codebase scan)"
Confidence: medium
Tags: [api, interface]
```

**Undocumented discoveries → `lesson` entries:**
```
Type: lesson
Content: "{code-doc divergence description}. (Source: codebase scan)"
Confidence: medium
Tags: [code-doc-gap, {relevant-tags}]
```

### 3d. Knowledge Extractions → Direct Pass-Through

The knowledge-extractor already produces classified entries. Pass through with minimal transformation.

### 3e. Dedup Against Existing Vault

Use the scout report's "Existing Vault Entries" section. For each new extraction, check if the vault already has this knowledge:
- **Already exists with same detail** → skip (deduped)
- **Exists but new version is richer** → flag for update
- **Doesn't exist** → proceed to write

### 3f. Cross-Source Dedup

Same knowledge from multiple subagents:
- **Same entity, different detail** → keep the richer version, merge source attribution
- **Same decision from docs and code** → keep docs version (has rationale), add code confirmation
- **Structural pattern also in README** → merge, cite both sources

### 3g. Apply Confidence Threshold

Drop extractions below `confidence_threshold`. Default is `low` (include everything).

### 3h. Order for Writing

1. High confidence first
2. Patterns first (structural context helps everything downstream)
3. Decisions next (architectural choices)
4. Lessons, ideas, todos last
5. Last item should be low-risk (triggers git commit)

---

## Phase 4: Feed Through Vault Update

For each merged extraction, invoke vault-update logic:

1. **Dedup check** — `obsidian vault="{vault_name}" search query="..." format=json`
2. **Classify & tag** — refine type, generate 2-5 kebab-case tags, determine target
3. **Write** — build frontmatter, write via `obsidian vault="{vault_name}" create ... overwrite silent`
4. **Validate** — read back and verify schema compliance, auto-fix
5. **Index** — regenerate project and master index
6. **Commit** — git commit (only on last extraction)

Each extraction becomes:
```yaml
content: "{polished, self-contained text}"
project: "{project}"
source-session: "context-init-{project}-{YYYY-MM-DD}"
type: "{decision|lesson|idea|todo|pattern}"
confidence: "{high|medium|low}"
skip_proposals: false
skip_commit: true  # true for all except the last
```

Track outcomes: `written`, `deduped`, `proposed`, `failed`.

Continue on individual failures.

---

## Phase 5: Summary Report

```
📊 Context Initialization Complete
═══════════════════════════════════

Project: {project}
Path: {project_path}
Vault: {vault_name}

Reconnaissance (vault-scout):
  project files found:    {count}
    tier 1:               {count}
    tier 2:               {count}
  source dirs:            {list}
  language:               {detected}
  existing vault entries: {count}

Extraction Results:
  structure-analyzer:     {✓ | ✗ failed}
    components:           {count}
    relationships:        {count}
  knowledge-extractor:    {✓ | ✗ failed}
    raw extractions:      {count}
  codebase-scanner:       {✓ | ✗ failed}
    entry points:         {count}
    workflows:            {count}
    state machines:       {count}

Merge Results:
  total extractions:      {count}
  deduped (cross-source): {count}
  deduped (vs vault):     {count}
  after dedup:            {count}
  by type:
    patterns:             {count}  (structural + conventions)
    decisions:            {count}
    lessons:              {count}
    ideas:                {count}
    todos:                {count}

Vault Results:
  ✅ Written:             {count}
  🔄 Deduped:            {count}
  📋 Proposed:           {count}
  ❌ Failed:             {count}

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

## Subagent Pipeline Visualization

```
vault-context (orchestrator — does no file I/O)
│
├─ Phase 1: vault-scout (sequential — other phases depend on this)
│   ├─ Scans project filesystem → file inventory, tiers, project shape
│   ├─ Searches vault → existing entries for this project
│   └─ Output: unified scout report
│
├─ Phase 2: 3 extractors (parallel — all receive scout report data)
│   ├─ structure-analyzer  → components, relationships, boundaries
│   ├─ knowledge-extractor → decisions, lessons, patterns, ideas, todos
│   └─ codebase-scanner    → module graph, workflows, state machines, APIs
│
├─ Phase 3: merge + classify + dedup (in-skill)
│
├─ Phase 4: vault-update (sequential writes)
│
└─ Phase 5: summary report
```

## Rules

- ALWAYS delegate discovery to vault-scout — never scan files in this skill
- ALWAYS spawn extraction subagents in parallel — don't serialize what can be concurrent
- ALWAYS pass scout report data to extraction subagents — they should not re-discover
- ALWAYS continue the pipeline if one extraction subagent fails — partial > none
- ALWAYS dedup against existing vault entries (from scout report) before writing
- ALWAYS cross-source dedup before writing — same knowledge from docs AND code
- ALWAYS go through vault-update for writes — never write vault entries directly
- ALWAYS prioritize patterns first — structural context helps everything downstream
- NEVER halt the pipeline for individual write failures
- NEVER read source files in this skill — that's the subagents' job
- NEVER skip the merge phase — raw subagent output is not vault-ready
- ALWAYS output the summary report at the end
