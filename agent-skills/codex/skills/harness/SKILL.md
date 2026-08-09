---
name: harness
description: "Set up, add to, or polish minimal user/project agent documentation. Use for AGENTS.md/CLAUDE.md setup, durable context additions, current-state refreshes, deduplication, and pruning. Modes: setup, add, polish. Scopes: user, project."
---

# Harness

Use `harness <setup|add|polish> [user|project] [request]`. Infer scope only when unambiguous; otherwise ask one focused question.

## Rules

- Read the project instructions, existing docs, git state, and only enough code to verify claims.
- Document only explicit durable user decisions or verified constraints that code, tests, and source comments cannot carry.
- Prefer source comments, then one existing owner. Minimize document types, files, and bytes; keep general partial/local docs under 50 lines.
- Write compressed current-state contracts. Delete history, measurements, walkthroughs, routine progress, duplicated facts, and agent-obvious mechanics.
- Preserve user work. Never resolve conflicting instructions by guessing.

## setup

- Project scope: create root `AGENTS.md` and a `CLAUDE.md` symlink when needed. User scope: keep one canonical global harness with both runtime links.
- Add another document only when necessary content cannot fit its existing owner. Do not create indexes, templates, guards, hooks, or status files by default.

## add

- Reject routine edits and session narration. Add a qualifying fact to its single nearest owner in a few lines; do not create a machine-notes tree by default.
- Record an executable user decision and implement it in the same task; documentation is not a substitute for the change.

## polish

- Verify docs against current code and settled user decisions; update current facts, then remove stale, duplicated, inferred, and non-actionable content.
- Consolidate or delete unnecessary document kinds. Preserve current outcomes, representative evidence, and genuinely non-obvious constraints.

## Verify

Re-read the diff, resolve links/references, run configured documentation checks, and report changed/removed files plus unresolved conflicts.
