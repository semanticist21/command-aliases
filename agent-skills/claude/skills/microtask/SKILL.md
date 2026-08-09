---
name: microtask
description: Execute, verify, commit, and push one small bounded repository change without creating a worktree or process artifacts.
---

# Microtask

- Read the nearest instructions and git status; preserve unrelated work and ask on overlap or conflict.
- Work in an existing task worktree or a non-protected task branch. If only the default/protected branch is available, hand off to `task` for isolation.
- Fix the owning cause with the smallest complete diff. Hand off to `task` when risk or scope becomes material; do not shrink the fix to remain a microtask.
- Create no plan, queue, journal, status, handoff, reviewer, subagent, test, doc, or gate unless the change itself requires it.
- Run only relevant checks and review the diff. Stage explicit paths, commit and push safely, then report result and verification concisely.
