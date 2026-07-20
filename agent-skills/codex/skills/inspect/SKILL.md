---
name: "inspect"
description: "Read-only systemic audit that finds, verifies, and ranks real problems across a codebase or feature. Not for: root-causing one known bug (analysis), general research questions (research), single-diff review, or deleting unused code (dead-code-removal)."
---
# Inspect

Run a read-only, evidence-led audit for real correctness, durability, security, design, performance, maintainability, and testability defects. Do not implement fixes or change tracked state; only write `.agent-tmp/inspect-findings.md` as the handoff ledger for `$task`/`$microtask`.

## Method

1. Read governing instructions, repository shape, recent relevant history/diff, tests, configuration, and feature entry points. State audit scope and exclusions.
2. Trace the behavior end-to-end: inputs, validation, state transitions, persistence/network boundaries, errors/retries, concurrency/idempotency, authorization/secrets, observability, and user-visible outcomes. For UI, inspect actual browser/render behavior where available.
3. Use targeted searches and tests/commands only to prove a candidate. Cross-check call sites, types/schemas, migrations, configuration, and tests; distinguish confirmed defects from risks needing context.
4. Rank only actionable findings by severity and likelihood. Each finding needs exact path/line, concrete failure scenario, evidence, affected scope, and a minimal direction for repair. Combine duplicates under the root cause.
5. Re-read the audit for false positives, repo constraints, and regressions already prevented by tests/guards. If no issues are confirmed, say so with coverage limits.

## Output

Lead with findings ordered P0–P3; omit empty severity sections. Include evidence and a concise remediation direction, then coverage, checks run, and uninspected areas. Record uncovered scope in the ledger; never claim full correctness from static review or offer an implementation unless requested.
