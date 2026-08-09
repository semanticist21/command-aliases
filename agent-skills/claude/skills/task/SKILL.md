---
name: task
description: Implement and land a repository change in an isolated worktree. Use when the work needs branch isolation, multiple files or layers, meaningful QA, or end-to-end landing.
---

# Task

Treat the invocation as the full goal. Preserve its scope and own it through verification, landing, and cleanup.

## Start

- Read the nearest instructions and inspect branch, status, and worktrees. Preserve all unowned changes and resources.
- Create one clean worktree from the current base, using the repository wrapper when present. Do not create task-state, queue, plan, journal, status, or handoff files unless the work truly needs persistence or owns external resources.
- Plan in chat only when the work is meaningfully multi-step. Do not add subagents, reviewers, tests, docs, or gates by ritual.

## Work

- Make the smallest complete change at the layer that owns the behavior. For defects, establish the causal path and fix it there; do not ship a symptom guard or workaround.
- Name code after the lifecycle or observable effect it owns. Follow current project conventions rather than documenting them again.
- Ask before resolving conflicting instructions, changing product direction, or taking an irreversible action.
- Run only checks the changed paths can break; exercise the causal path for defects and inspect the real UI when appearance matters. Review the full diff yourself.
- Use one independent read-only reviewer only for material security, billing, migration, release, concurrency, public-contract, irreversible, or genuinely uncertain risk.

## Land

- Stage explicit paths, commit intentionally, follow the repository's push/PR/merge policy, and never wait on advisory CI.
- Remove only task-owned worktrees, branches, and external resources; prove their absence. Do not sweep shared state.
- Report the result, verification, commit/PR, and surviving owned resources concisely. Finish only when no executable in-scope work remains.
