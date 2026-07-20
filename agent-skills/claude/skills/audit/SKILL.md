---
name: "audit"
description: "Read-only systemic audit that hunts, verifies, and ranks real problems across a codebase or feature — design flaws, correctness bugs, logic holes, durability/idempotency/concurrency gaps, authz-boundary and data-integrity holes, silent failures, long-term operations/policy gaps, layer-contract drift, UX problems, and structural inefficiency (over-engineering, reinvented stdlib, speculative abstraction, dead flexibility) — then hands them off as a findings ledger for task/microtask to fix. Use for audit, 점검/조사, '이슈 리스트업', 'find issues', 'what's wrong here', 'what could bite us', '비효율적 구조', '과잉 설계'. Not for reviewing one diff (code-review), root-causing one known bug (analysis), general research questions (research), or deleting unused code (dead-code-removal)."
user-invocable: true
argument-hint: "<surface to audit + any focus/constraints>"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash(cd*)
  - Bash(ls*)
  - Bash(cat*)
  - Bash(wc*)
  - Bash(find*)
  - Bash(test*)
  - Bash(mkdir*)
  - Bash(rg*)
  - Bash(git rev-parse*)
  - Bash(git -C*)
  - Bash(git status*)
  - Bash(git diff*)
  - Bash(git log*)
  - Bash(git grep*)
  - Bash(git ls-files*)
  - Task
---
# Audit

Read-only, evidence-led audit of the named surface. Find real defects and hand them to `task`/`microtask`; do not implement fixes.

## Hunt

Trace inputs, state, side effects, boundaries, and failure paths. Check design responsibility, correctness/untaken branches, data durability, idempotency, races, authz/tenant isolation, error contracts, referential integrity, operations/retention, schema/API/client drift, UX/accessibility, and unnecessary complexity. Respect scope; broad search is not proof.

## Loop

1. Map instructions, architecture, entrypoints, tests, configs, history, and requested focus. Form hypotheses from concrete code paths.
2. For each candidate, verify the triggering conditions and impact with call-chain evidence, tests, docs/contracts, or reproducible reasoning. Seek counterexamples; discard speculation and duplicates.
3. Repeat until a targeted pass is dry. Do not claim exhaustive absence unless the search boundary makes that meaningful.

## Findings ledger

Rank by impact × likelihood: critical (security/data loss/outage), high, medium, low. Each finding must give ID, severity/category, precise location, triggering scenario, evidence, impact, smallest safe remediation direction, and validation. Separate confirmed findings from questions/risks. Include positive checks only when they materially constrain a conclusion.

End with scope audited, methods/checks, findings count by severity, residual limits, and a handoff order. Do not pad with style nits, rewrite one-diff review into audit, or weaken evidence to manufacture findings.
