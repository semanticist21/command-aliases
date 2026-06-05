---
name: agent-review
description: Review work completed during the current session by analyzing recent git log commits. Use when the user wants to review what was done in this session, validate session work, or get a critique of the changes just shipped.
version: 1.0.0
user-invocable: true
argument-hint: "[scope or focus area, optional]"
---

Review the work performed during the **current session** using `git log` as the source of truth for what changed.

## Step 1 — Identify session commits

Determine which commits belong to this session:

1. Run `git log --oneline -30` to see recent history.
2. Identify commits authored during the current session. Heuristics:
   - Commits newer than the session start (check the first commit referenced in this conversation, if known).
   - Commits matching topics the user asked about in this conversation.
   - If unclear, ask the user how far back to review (e.g. "last N commits" or "since <sha>").
3. If there are uncommitted changes (`git status`), include them as "in-progress work" in the review.

## Step 2 — Gather context per commit

For each commit in scope:

- `git show --stat <sha>` — files touched, line counts.
- `git show <sha>` — actual diff.
- Cross-reference with the conversation: what did the user ask for? Does the commit match?

Batch these in parallel when possible.

## Step 3 — Review against intent

For every commit, evaluate:

- **Intent match**: does the diff do what the user asked for, nothing more, nothing less?
- **Scope creep**: unrelated refactors, speculative abstractions, or files that didn't need touching.
- **Correctness**: obvious bugs, broken edge cases, type errors, missing nil/undefined handling.
- **Project conventions**: did it follow the rules in nearby `AGENTS.md` / `CLAUDE.md` files? Style, structure, naming.
- **Reversibility**: any destructive or hard-to-reverse moves (force pushes, deletions, dropped tests, disabled hooks).
- **Test/verification gap**: was the change verified? Any missing tests, missed UI check, missed type-check?

## Step 4 — Report

Produce a concise report with this shape:

```
## Session Review

### Commits reviewed
- <sha> <subject>
- ...
(plus uncommitted changes if any)

### Per-commit findings
<sha> — <subject>
  ✓ what landed correctly
  ⚠ issues / smells / risks
  → suggested follow-up (if any)

### Cross-cutting observations
- consistency, drift, accumulated tech debt across the session

### Verdict
- ship / fix-before-ship / rework
- top 1-3 actionable follow-ups
```

## Rules

- **Don't fix anything** unless the user explicitly asks. This skill produces a review, not a patch.
- Be specific: cite `path:line` for issues, not vague impressions.
- Be honest about positives too — feedback should reflect both successes and misses (see [[feedback_consistent_ui]] style).
- If the session crosses multiple unrelated topics, group findings by topic rather than commit order.
- Skip commits the user clearly didn't ask about in this session (e.g. pre-existing work from `git log`).
