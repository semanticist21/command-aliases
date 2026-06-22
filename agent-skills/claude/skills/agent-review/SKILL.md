---
name: "agent-review"
description: "Review current-session code changes with subagents. Use when asked for a review, QA pass, or review-and-fix loop."
---
Review the work this agent actually performed during the **current session**, then judge that work
against the **user's explicit request and success criteria**, using the **current state** of the repo
as evidence. Prefer findings from **delegated subagents** when the runtime provides them; otherwise
the main thread performs the same review checks and reports that delegation was unavailable. By
**default this is a single-pass review-and-report** — it surfaces findings, it does not change code.
Only when the user asks for a converging/remediation run does it **attempt a capped loop until a
round returns zero findings** (fixing between rounds). The main thread stays a thin orchestrator
when delegation is available: it scopes the work, fans out reviewers, and — in remediation mode —
decides what to fix and re-reviews.

## Sources of truth (in priority order)

1. **The user's request and success criteria** — the exact ask, latest clarifications, explicit
   constraints, non-goals, requested verification, and acceptance criteria. This is the authority for
   whether the deliverable is correct.
2. **This agent's session record** — the conversation transcript, tool calls, edits, attempts,
   reversions, compacted summaries, and task logs from the current run. This is the authority for
   authorship and scope.
3. **The current code** — working-tree files, `git diff`, `git diff --staged`, untracked files, and
   committed patches only as evidence of the present deliverable. Review these only where the
   session record shows this agent touched or created them.
4. **Git metadata** — status, diff, staged diff, and log are corroborating only. Git answers "what
   is currently changed/committed," not "what this agent did." Never anchor scope on git state or a
   guessed commit range.

## Step 1 — Scope the session (main thread)

- Extract the review contract from the user's request first: requested outcome, explicit non-goals,
  constraints, acceptance checks, and any latest-message overrides. If the user asks to review
  whether the prior work matched a request, that request is the rubric.
- Derive the review scope from this agent's own deliverable actions: files patched,
  generated, deleted, staged, committed, or explicitly handed off by the conversation. Files only
  read during exploration are context, not review targets, unless the user explicitly includes them.
  Do not infer authorship from dirty git state, branch position, recent commits, or `git log`.
- Map the review contract and session-touched files/areas to current code (`git status`, `git diff`, `git
  diff --staged`, untracked files) and to commits only when the session record shows this agent made
  those commits. Don't guess a commit range; ask only if the session record cannot disambiguate
  scope.
- Include uncommitted + untracked changes only when this session touched them, or when the user
  explicitly asked to review them.
- Exclude pre-existing or concurrent work the session didn't touch, even if it is dirty, staged, or
  recently committed. Only ask the user to bound scope if the session record genuinely can't
  disambiguate.

## Step 2 — Fan out reviewers (delegate)

When a subagent tool is available, spawn review **subagents in parallel**, one per coherent
area/concern (or per session-made commit when commits are clean units). If no subagent tool is
available, the main thread reviews the same areas directly and notes the fallback in the report.
Give each reviewer: the user's explicit request and success criteria, the intent from the
conversation, the exact session-touched files/areas it may review, the current code/diff for that
area, and the relevant `AGENTS.md`/`CLAUDE.md` rules. Each returns a structured findings list (no
fixes), every finding
tagged **HIGH / MED / LOW** with a `path:line` cite. Reviewers judge:

- **User-request fit** — does the change satisfy the user's explicit ask, constraints, and requested
  verification, nothing more/less?
- **Scope creep** — unrelated refactors, speculative abstraction, files that didn't need touching.
- **Correctness** — bugs, broken edge cases, type errors, missing nil/undefined handling.
- **Conventions** — nearby `AGENTS.md`/`CLAUDE.md` rules: style, structure, naming, lint/test policy.
- **Reversibility** — destructive/hard-to-reverse moves (force push, deletions, dropped tests, disabled hooks).
- **Verification gap** — was it verified? Missing tests, skipped type-check/UI check.

**Adversarially verify** each HIGH/MED before trusting it: use a skeptic subagent when available, or
perform a separate explicit refutation pass in the main thread. Drop findings that are refuted.
This kills plausible-but-wrong findings.

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
- session-local drift, request fit, consistency across the session

### Verdict
- ship / fix-before-ship / rework  +  top 1-3 actionable follow-ups
- if looped: "converged to 0 findings in N rounds" or "stalled on X, escalated"
```

## Rules

- **Delegate when available.** Prefer subagents for findings and bounded fixes. If delegation is not
  available, keep the same rubric and state the fallback.
- **No praise padding.** Note what landed correctly only when it's load-bearing for the verdict.
  Severity-tag every finding; cite `path:line`, not vague impressions.
- **Review-only by default** — do not fix unless the user asked for a converging/remediation run.
  When in doubt, report and ask.
- Group findings by topic, not commit order, when the session spans unrelated work.
