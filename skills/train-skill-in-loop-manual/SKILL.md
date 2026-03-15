---
name: train-skill-in-loop-manual
description: Iteratively train any skill with human feedback. Invoke a skill, present output, collect feedback, update within declared scope, repeat until satisfied. Use to refine draw-diagram preferences, tune skill behavior, or iterate on any skill output. Triggers on "train skill", "training loop", "iterate on skill", "refine with feedback".
---

# Train Skill in Loop (Manual)

Iteratively invoke a skill with human feedback until the output meets expectations.
Each iteration's learnings can be persisted to the skill's preference memory.

## Inputs

Gather these from the user before starting the loop:

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `skill` | ✅ YES | — | Skill name to train (e.g., `draw-diagram`) |
| `input` | ✅ YES | — | Input to pass to the skill — exactly as the user would invoke it |
| `scope` | ✅ YES | — | What the agent is allowed to change between iterations |
| `max_iterations` | No | 10 | Safety cap to prevent infinite loops |

### Scope Examples

The scope constrains what the agent modifies between iterations:

| Scope | What Can Change | What's Fixed |
|-------|----------------|--------------|
| `"layout and spacing"` | Element positions, sizes, whitespace | Elements, colors, text, structure |
| `"colors and style"` | Fill, stroke, strokeWidth, roughness | Element count, positions, text |
| `"the design doc"` | Context document content | Draw process, reference data |
| `"arrow routing"` | Arrow points arrays, bindings | Everything else |
| `"everything"` | Full freedom | Nothing — use carefully |
| `"text content only"` | Labels, titles, descriptions | Visual layout, colors |

## Setup Phase

### 1. Load the Target Skill

Read the target skill's `SKILL.md`:

```
Read: skills/{skill}/SKILL.md
```

Understand what inputs it expects and what it produces.

### 2. Validate Input

Confirm the `input` matches the skill's required fields. If anything's missing, ask the user.

### 3. Show Training Brief

Present to the user before starting:

```
═══════════════════════════════════════
  TRAINING LOOP: Setup
═══════════════════════════════════════
  Skill:          {skill}
  Input:          {summary of input}
  Scope:          {scope}
  Max iterations: {max_iterations}

  The loop will:
  1. Run {skill} with your input
  2. Show you the output
  3. Ask for feedback
  4. Apply changes within scope: "{scope}"
  5. Repeat until you say "done" or "no more feedback"
═══════════════════════════════════════
```

Wait for user confirmation before proceeding.

## Training Loop

### For each iteration (1 to max_iterations):

#### A. INVOKE

Execute the target skill's workflow with the current input.
Follow the skill's SKILL.md instructions exactly — you ARE running that skill.

#### B. PRESENT

Show the output to the user clearly:
- For diagrams: render to PNG and display the image
- For text output: display the content
- For files: show the file path and key content

Include iteration number:
```
── Iteration {n}/{max_iterations} ──────────────
```

#### C. ASK FOR FEEDBACK

Ask the user:
```
What feedback do you have? (or "done" to finish)
```

#### D. EVALUATE RESPONSE

| User Says | Action |
|-----------|--------|
| `"done"`, `"no more feedback"`, `"looks good"`, `"ship it"` | → EXIT loop |
| Specific feedback (e.g., "make the arrows thicker") | → CONTINUE to Update |
| `"start over"` | → Reset to original input, restart loop |

#### E. UPDATE (within scope)

1. **Parse feedback** into actionable changes
2. **Check scope** — is each change within the declared scope?
   - If yes: apply the change
   - If no: tell the user: *"That change is outside scope '{scope}'. Would you like to expand the scope, or adjust your feedback?"*
3. **Log the change**: what was modified and why
4. **Apply** the changes to the input/output

Show what changed:
```
Changes applied:
  - {what changed}: {old} → {new}
  - {what changed}: {old} → {new}
```

#### F. REPEAT

Go back to step A with updated input.

## Exit Phase

### 1. Summary Report

```
═══════════════════════════════════════
  TRAINING LOOP: Complete
═══════════════════════════════════════
  Skill:       {skill}
  Iterations:  {count}
  Changes:
    Iteration 1: {summary}
    Iteration 2: {summary}
    ...

  Final output: {output path or summary}
═══════════════════════════════════════
```

### 2. Persist Learnings (if applicable)

If the target skill has a `data/preferences.md` file, ask:

```
Should I save what we learned to {skill}'s preference memory?
(This helps future diagrams of the same type)
```

If yes, append to the skill's `data/preferences.md`:
- What context type this was
- What preferences were established
- What anti-patterns were discovered
- Date of the training session

Format for preference entries:
```markdown
### {context-type}
- Learned: {what works}
- Avoid: {what doesn't work}
- Source: training session {date}
```

### 3. Git Commit (if files were modified)

```bash
cd {project_root}
git add .
git diff --cached --quiet || git commit -m "train: {skill} - {iteration_count} iterations, learned {summary}"
```

## Rules

- ALWAYS gather skill, input, and scope before starting
- ALWAYS show the training brief and wait for confirmation
- ALWAYS check scope before applying changes
- ALWAYS show what changed between iterations
- ALWAYS ask about persisting learnings at the end
- NEVER modify files outside the declared scope
- NEVER skip the feedback step — the human drives the loop
- NEVER exceed max_iterations — show summary and exit
- NEVER modify a skill's preferences.md during the loop — only at the end
