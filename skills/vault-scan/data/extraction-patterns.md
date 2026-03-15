# Extraction Patterns

## What to Extract

Session history contains a mix of mundane tool calls and genuinely knowledge-worthy exchanges. Your job is to separate signal from noise.

### High-Priority Extractions

These should almost always be captured:

#### `/vault-capture` Commands
- User explicitly marked something for capture with `/vault-capture "text"`
- **Confidence:** high (user-initiated)
- **Action:** Extract verbatim, classify by content

#### Explicit Decisions
- User or assistant chose between alternatives with stated rationale
- "We'll go with X because Y" / "Decided to use Z"
- Architecture, technology, process, or design choices
- **Confidence:** high
- **Type:** decision

#### Lessons from Mistakes
- Something broke and was fixed — the fix contains a lesson
- "Turns out X doesn't work because Y" / "The issue was..."
- Debugging insights that would save time if remembered
- **Confidence:** high
- **Type:** lesson

#### Action Items Assigned
- Explicit "TODO", "need to", "should do X later"
- Deferred work acknowledged but not completed
- **Confidence:** medium-high
- **Type:** todo

### Medium-Priority Extractions

Capture if substantive:

#### Ideas Proposed
- "What if we..." / "Could we..." / "Idea:"
- Speculative features, improvements, or approaches discussed
- **Confidence:** medium
- **Type:** idea

#### Patterns Observed
- Same approach used repeatedly across different tasks
- "We keep doing X" / "Every time we need Y, we do Z"
- **Confidence:** medium
- **Type:** pattern

#### Process Insights
- Workflow improvements discovered during the session
- "This worked better when we..." / "Next time, do X first"
- **Confidence:** medium
- **Type:** lesson

### Low-Priority / Skip

Do NOT extract:

- Routine file reads and writes (tool noise)
- Debugging back-and-forth that didn't yield a lesson
- Configuration that's already in code (redundant with source)
- Extremely context-specific decisions with no future relevance
- Simple acknowledgments or status updates

## Extraction from Compaction Summaries

Compaction summaries are condensed session history — they're gold mines for extraction because they already highlight what was important.

### Compaction Entry Structure

```json
{
  "type": "compaction",
  "summary": "## Session Summary\n\n### Key Decisions...",
  "firstKeptEntryId": "..."
}
```

### What to Look For in Summaries

- **"Key Decisions" sections** → decision extractions
- **"Problems Solved" sections** → lesson extractions
- **"TODO / Follow-up" sections** → todo extractions
- **"Architecture" mentions** → decision or pattern extractions
- Any structured list items are pre-filtered high-value content

## Extraction from Messages

### User Messages
- Directives that contain decisions ("let's use X", "go with Y approach")
- Questions that imply missing knowledge ("how do we...", "what's the best way to...")
- Explicit capture requests

### Assistant Messages
- Recommendations accepted by the user (decision + rationale)
- Warnings or gotchas surfaced during implementation (lessons)
- Proposed approaches that were adopted (decisions)

### Tool Results
- Error messages that led to code changes (lessons)
- Search results that influenced decisions (context for decisions)
- Generally skip — tool results are noise unless they caused a pivot

## Deduplication Hints

When extracting, flag potential duplicates:
- If a decision was discussed multiple times, extract once with the most complete rationale
- If the same TODO appears in multiple exchanges, extract once
- Prefer the most recent/refined version of any repeated content
