---
name: "microtask"
description: "Execute, verify, commit, and push a small bounded repository change directly without creating a worktree."
---
# Microtask

Use for one small, bounded change that can safely finish in current task context. `/microtask` input is
the goal; preserve user constraints and follow `task` unless this file overrides it.

## Scope and location

1. Read nearest instructions, git status/operation, active goal, and owned queue. Reuse matching goal;
   unrelated active goal is a conflict. Codex creates a goal before planning and uses `update_goal` only
   for terminal `complete`/`blocked` states.
2. Work in active parent `task` worktree and branch when one exists; otherwise current base branch.
   Never create a worktree or task branch. Do not touch unowned worktrees, queues, or branches.
3. Direct work may be dirty: preserve unrelated files, stage explicit changed paths only, and never stash,
   reset, move, or overwrite user changes. Stop on unfinished git operation or ambiguous overlapping edits.
4. If task is not genuinely small/bounded, queued work needs isolation, or user asks for a plan, hand off
   to `task` rather than expanding microtask scope.

## Work

1. Plan briefly: requested behavior, paths, risk, and verification. Read relevant docs and nearby code.
2. Follow `task` contracts for implementation, regression tests, architecture, security, UI browser/render
   verification, queue ownership, and inspect-ledger handling. UI code inspection alone is insufficient.
3. Run standard gates on changed paths without duplicate focused, aggregate, or CI coverage.
   Use `task-verify` only for explicitly uncovered gates.
4. Every QA round needs two independent reviewers against the verbatim request, diff, and broader affected
   behavior/integration surface. Fix actionable findings; behavior changes require fresh affected
   verification and review. No reviewer availability is a blocker, not permission for self-review.

## Commit, landing, output

1. After clean QA, stage and commit explicit paths using project Conventional Commit style. Inspect the
   committed paths and remaining status; never include unrelated changes.
2. Push the new commit to its configured upstream by default. Immediately before push, fetch the upstream
   and require that the new commit is still `HEAD` and the only commit ahead of upstream; otherwise stop
   instead of publishing unrelated commits. Skip direct push only when a parent task or CI/PR lane owns
   landing, the user requests local-only work, or no upstream exists. Never force push; stop and report a
   rejected or non-fast-forward push instead of rebasing, merging, or stashing unrelated work automatically.
3. Follow parent task landing/cleanup; direct work must land on the intended base before completion.
   Drain eligible owned queue items oldest first. Never report done with owned queued, side-worktree, or
   unmerged work; report exact blocker and remaining queue instead.
4. Final response uses `task` Output: changed work, verification, QA counts, status, commit, push/landing,
   and risk.
   End with one concise Korean summary sentence.

## Safety

- `complete` requires verification, review, intended commit, landing/cleanup when applicable, and queue drain.
- Do not weaken user/repository constraints to claim zero findings or completion.
