---
name: train-skill-in-loop-manual
description: Iteratively train any skill by spawning subagents for execution and collecting human feedback between rounds. Each iteration runs in an isolated subagent process, results come back for review. Triggers on "train skill", "training loop", "iterate on skill", "refine with feedback".
---

# Train Skill in Loop (Manual)

Iteratively invoke a skill via subagents with human feedback until the output meets expectations. Each skill invocation runs in an isolated subagent — clean context, focused execution. Results return to the main agent for user review.

## Inputs

Gather these from the user before starting:

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `skill` | ✅ YES | — | Skill name to train (e.g., `draw-diagram`) |
| `agent` | No | auto-detect | Subagent to use (e.g., `diagram-renderer`). If not specified, pick from available agents. |
| `input` | ✅ YES | — | Input to pass to the skill — what the user would normally say |
| `scope` | ✅ YES | — | What the agent is allowed to change between iterations |
| `existing_output` | No | — | Path to existing output from a previous run. If provided, skip the first spawn and go straight to feedback. Use when iterating on output from a prior session. |
| `max_iterations` | No | 10 | Safety cap |

### Agent Mapping

| Skill | Recommended Agent | Why |
|-------|-------------------|-----|
| `draw-diagram` | `diagram-renderer` | Isolated context with just reference + design doc |
| (other skills) | `worker` | General-purpose, full capabilities |

### Scope Examples

| Scope | What Can Change |
|-------|----------------|
| `"layout and spacing"` | Element positions, sizes, whitespace |
| `"colors and style"` | Fill, stroke, strokeWidth |
| `"the design doc"` | Context document content |
| `"arrow routing"` | Arrow points arrays, bindings |
| `"everything"` | Full freedom |

## Setup Phase

### 1. Identify the Subagent

Check available agents:
```
subagent({ agent: "worker", task: "list available agents" })
```

Or use the recommended agent for the skill (see mapping above).

### 2. Prepare the Task Prompt

Build a task string for the subagent that includes:
- The skill instructions (read from the SKILL.md)
- The user's input
- The scope constraints
- File paths for reference data the subagent should read

### 3. Show Training Brief

```
═══════════════════════════════════════
  TRAINING LOOP: Setup
═══════════════════════════════════════
  Skill:      {skill}
  Agent:      {agent} (subagent — isolated context)
  Input:      {summary}
  Scope:      {scope}
  Start:      {existing_output ? "feedback-first (existing output)" : "fresh run"}
  Max:        {max_iterations} iterations

  Each iteration spawns a fresh subagent.
  You review output and give feedback between rounds.
═══════════════════════════════════════
```

Wait for user confirmation.

## Training Loop

### Entry Point

If `existing_output` is provided:
1. Skip step A for the first iteration
2. Read the existing output file
3. Go directly to **B. PRESENT RESULT** with the existing output
4. Collect feedback, then proceed to step A for iteration 2+

This avoids wasting an iteration re-generating output you already have from a prior session.

### For each iteration (1 to max_iterations):

#### A. SPAWN SUBAGENT (skip on iteration 1 if existing_output provided)

Build the task with current input + any accumulated feedback:

```
subagent({
  agent: "{agent}",
  task: "
    {skill instructions from SKILL.md}

    INPUT:
    {current input — original + applied feedback}

    SCOPE (what you may adjust):
    {scope}

    OUTPUT:
    Write result to {output_path}

    {if iteration > 1:}
    FEEDBACK FROM PREVIOUS ITERATION:
    {user feedback}

    CHANGES TO APPLY:
    {parsed actionable changes within scope}
  "
})
```

The subagent runs in isolation — reads references, generates output, writes files, validates. When done, it returns its result to us.

#### B. PRESENT RESULT

Show the subagent's output to the user:
- For diagrams: read the output file, render PNG if available, display image
- For text: display content
- Show subagent usage stats (tokens, cost, model)

```
── Iteration {n}/{max_iterations} ──────────────
Agent: {agent} | {usage stats}

{rendered output or file preview}
```

#### C. ASK FOR FEEDBACK

```
What feedback do you have? (or "done" to finish)
```

#### D. EVALUATE RESPONSE

| User Says | Action |
|-----------|--------|
| `"done"`, `"looks good"`, `"ship it"` | → EXIT loop |
| Specific feedback | → Parse changes, check scope, CONTINUE |
| `"start over"` | → Reset to original input, restart |

#### E. PREPARE NEXT ITERATION

1. Parse feedback into actionable changes
2. Verify each change is within declared scope
   - Out of scope → ask: *"That's outside scope '{scope}'. Expand scope or adjust?"*
3. Log changes for the next subagent's task prompt
4. Show what will change:

```
Changes for next iteration:
  - {change description}
  - {change description}
```

#### F. VERIFY SUBAGENT APPLIED CHANGES

After the subagent returns, **verify the output actually changed**:

1. Compare the new output against the previous output — did the feedback get applied?
2. Check measurable criteria from the feedback (e.g., "nodes overflowing" → check node sizes)

If the subagent **did NOT apply the feedback** (output unchanged or issues persist):

| Diagnosis | Fix |
|-----------|-----|
| Task prompt too vague | Make feedback more concrete — include specific values, before/after examples |
| Subagent can't do the math | Include pre-computed values in the task (e.g., "set node X width to 450") |
| Subagent wrote back same file | Include the feedback as the PRIMARY instruction, not an afterthought |
| Model limitation | Try a different model or break the task into smaller steps |

**RETRY the subagent** with an improved task prompt. Do NOT fall back to manual fixes
from the main session. The training loop's value comes from teaching the subagent —
manual fixes bypass learning and won't improve the agent or preferences.

If a subagent fails 2 consecutive retries on the same feedback, THEN escalate to the user:
*"The subagent isn't applying this feedback after 2 retries. Want me to adjust the
agent definition, simplify the feedback, or try a different approach?"*

#### G. LOOP BACK TO A

Spawn a fresh subagent with updated task. The subagent reads the previous output file and applies the feedback.

## Exit Phase

### 1. Summary Report

```
═══════════════════════════════════════
  TRAINING LOOP: Complete
═══════════════════════════════════════
  Skill:       {skill}
  Agent:       {agent}
  Iterations:  {count}

  Changes by iteration:
    #1: initial generation
    #2: {feedback summary → changes}
    #3: {feedback summary → changes}

  Final output: {output path}
═══════════════════════════════════════
```

### 2. Persist Learnings

Check if the skill has a `data/preferences.md`:
```bash
test -f skills/{skill}/data/preferences.md && echo "has preferences"
```

If yes, ask the user:
```
Save learnings to {skill}'s preference memory?
This helps future runs of the same context type.
```

If approved, append to `skills/{skill}/data/preferences.md`:

```markdown
### {context-type}
- Learned: {what the user liked}
- Avoid: {what the user didn't like}
- Iterations: {count} to converge
- Source: training session {date}
```

### 3. Git Commit

```bash
cd {project_root}
git add .
git diff --cached --quiet || git commit -m "train: {skill} - {count} iterations, learned {summary}"
```

## Rules

- ALWAYS use `subagent` tool to execute the skill — never run it inline
- ALWAYS present subagent results and wait for human feedback
- ALWAYS check scope before applying changes
- ALWAYS show what will change before spawning next subagent
- ALWAYS verify the subagent actually applied the feedback before presenting to user
- ALWAYS retry the subagent with improved task if feedback wasn't applied — never do manual fixes from the main session
- ALWAYS offer to persist learnings at the end
- NEVER modify preferences.md during the loop — only at the end, with user approval
- NEVER exceed max_iterations — show summary and exit
- NEVER skip the human feedback step — the human drives the loop
- NEVER fall back to manual fixes in the main session — the whole point is training the subagent. If it can't apply feedback, fix the task prompt and retry.
