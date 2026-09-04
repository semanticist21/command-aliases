---
name: task
description: Implement, verify, commit, and land repository changes in isolated, in-place, or commit-only modes.
---

# Task

Choose the mode from the request and repository state:

- `isolated` (default): create a clean worktree from the current base, make and verify the change, land it, then remove task-owned branch/worktree resources.
- `in-place`: make one small bounded change in the current checkout while preserving unrelated work.
- `commit`: inventory only task-owned changes, group independently reviewable intent dependency-first, stage exact paths/hunks, verify each staged diff, and create Conventional Commits. Push only when requested or required by repository policy.

Read repository instructions and status first. Preserve unrelated work, ask before conflicting/product/irreversible choices, run affected checks, review the full diff, and report landing plus survivors. For production migrations, deployments, cloud operations, or infrastructure cutovers, also read relevant operating context and resumable state before selecting a target.
