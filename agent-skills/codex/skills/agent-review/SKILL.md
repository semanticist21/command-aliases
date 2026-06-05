---
name: agent-review
description: Review the work done in the current session against the current state of the code, using delegated subagents. Defaults to a single-pass review-and-report; when asked to also fix, runs a converging remediation loop until findings reach zero. Use when the user wants to review/validate/critique what was done this session, audit session work before shipping, or 현상황에 맞게 했던 작업 리뷰. Not for general PR review (use review), a plain diff bug-hunt (use code-review), or a build-then-QA task (use task).
version: 2.0.0
user-invocable: true
argument-hint: "[scope or focus area, optional]"
---

Review the work performed during the **current session** against the **current state** of the
repo. Findings are produced by **delegated subagents**. By **default this is a single-pass
review-and-report** — it surfaces findings, it does not change code. Only when the user asks for a
converging/remediation run does it **loop until a round returns zero findings** (fixing between
rounds). The main thread stays a thin orchestrator: it scopes the work, fans out reviewers, and —
in remediation mode — decides what to fix and re-reviews.

## Sources of truth (in priority order)

1. **The conversation transcript** — the authoritative record of what this session was asked to
   do and what it actually did (tool calls, edits, attempts, reversions). Primary.
2. **The working tree** — `git diff`, `git diff --staged`, untracked files. The current state;
   often the real deliverable when work is uncommitted. First-class input, not an afterthought.
3. **Git log** — corroborating only. Commit messages can be rewritten/gated by hooks and
   concurrent agents may land commits, so log is a lossy proxy for "what this session did." Never
   anchor scope on log alone.

## Step 1 — Scope the session (main thread)

- Derive the set of files/areas this session actually touched from the conversation's own tool
  calls, then map them to working-tree changes (`git status`, `git diff`) and any matching
  commits. Don't guess a commit range and interrogate the user.
- Include uncommitted + untracked changes as primary review targets.
- Exclude pre-existing work the session didn't touch. Only ask the user to bound scope if the
  conversation genuinely can't disambiguate.

## Step 2 — Fan out reviewers (delegate)

Spawn review **subagents in parallel**, one per coherent area/concern (or per commit when commits
are clean units). Give each subagent: the intent from the conversation, the diff/working-tree for
its area, and the relevant `AGENTS.md`/`CLAUDE.md` rules. Each returns a structured findings list
(no fixes), every finding tagged **HIGH / MED / LOW** with a `path:line` cite. Reviewers judge:

- **Intent match** — does the change do what was asked, nothing more/less?
- **Scope creep** — unrelated refactors, speculative abstraction, files that didn't need touching.
- **Correctness** — bugs, broken edge cases, type errors, missing nil/undefined handling.
- **Conventions** — nearby `AGENTS.md`/`CLAUDE.md` rules: style, structure, naming, lint/test policy.
- **Reversibility** — destructive/hard-to-reverse moves (force push, deletions, dropped tests, disabled hooks).
- **Verification gap** — was it verified? Missing tests, skipped type-check/UI check.

**Adversarially verify** each HIGH/MED before trusting it: spawn a skeptic subagent prompted to
refute the finding; drop it if refuted. This kills plausible-but-wrong findings.

## Step 3 — Report, or loop to zero (mode-dependent)

**Default (review-only):** collect + dedupe this round's confirmed findings and go straight to
Step 4. Single pass — do not fix, do not loop.

**Remediation mode** (user asked to also fix / converge), run in rounds:

1. Collect + dedupe confirmed findings from this round's reviewers.
2. If zero → **done**, go to Step 4.
3. Fix the confirmed findings — delegate bounded fixes to subagents; re-run lint/tests the
   project defines.
4. Re-review the changed areas (back to Step 2), feeding the prior findings in so reviewers
   confirm they're resolved and didn't introduce regressions.
5. **Termination guarantees:** hard-cap at **3 rounds** — report any cap hit. Treat **no net
   reduction in confirmed-finding count** between rounds as a stall (catches oscillation where a
   fix resolves A but introduces B); escalate the surviving findings to the user rather than
   looping further.

## Step 4 — Report (main thread synthesis)

```
## Session Review  (N rounds, M reviewers)

### Scope
- areas/files reviewed (+ uncommitted/untracked called out)

### Findings by severity
HIGH — <path:line> <problem> → <resolution: fixed in round K / open>
MED  — ...
LOW  — ...

### Cross-cutting
- drift, accumulated debt, consistency across the session

### Verdict
- ship / fix-before-ship / rework  +  top 1-3 actionable follow-ups
- if looped: "converged to 0 findings in N rounds" or "stalled on X, escalated"
```

## Rules

- **Delegate, don't review inline.** The main thread orchestrates; subagents produce findings and
  bounded fixes. Keeps the main context lean across many rounds.
- **No praise padding.** Note what landed correctly only when it's load-bearing for the verdict.
  Severity-tag every finding; cite `path:line`, not vague impressions.
- **Review-only by default** — do not fix unless the user asked for a converging/remediation run.
  When in doubt, report and ask.
- Group findings by topic, not commit order, when the session spans unrelated work.
