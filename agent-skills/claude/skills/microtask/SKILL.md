---
name: "microtask"
description: "Execute a small bounded repository change directly, preserving task safety, QA, and landing rules without creating a worktree."
user-invocable: true
argument-hint: "<small task goal constraints>"
allowed-tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Grep
  - Glob
  - Bash(cd*)
  - Bash(git rev-parse*)
  - Bash(git -C*)
  - Bash(git status*)
  - Bash(git diff*)
  - Bash(git ls-files*)
  - Bash(git log*)
  - Bash(git worktree*)
  - Bash(git switch*)
  - Bash(git merge*)
  - Bash(git branch*)
  - Bash(git add*)
  - Bash(git commit*)
  - Bash(ls*)
  - Bash(mkdir*)
  - Bash(test*)
  - Bash(node*)
  - Bash(npm*)
  - Bash(bun*)
  - Bash(pnpm*)
  - Bash(yarn*)
  - Bash(make*)
  - Bash(cargo*)
  - Bash(python*)
  - Bash(pytest*)
  - Bash(uv*)
  - Bash(ruff*)
  - Bash(go*)
  - Bash(flutter*)
  - Task
---
# Microtask

Use for one small, bounded change that can safely finish in current task context. `/microtask` input is
the goal; preserve user constraints and follow `task` unless this file overrides it.

## Scope and location

1. Read nearest instructions, git status/operation, active goal, and owned queue. Reuse matching goal;
   unrelated active goal is a conflict. Claude creates a goal before planning and uses `/goal` only for
   terminal states.
2. Work in active parent `task` worktree and branch when one exists; otherwise current base branch.
   Never create a worktree or task branch. Do not touch unowned worktrees, queues, or branches.
3. Direct work may be dirty: preserve unrelated files, stage explicit changed paths only, and never stash,
   reset, move, or overwrite user changes. Stop on unfinished git operation or ambiguous overlapping edits.
4. If task is not genuinely small/bounded, queued work needs isolation, or user asks for a plan, hand off
   to `task` rather than expanding microtask scope.

## Work

1. Plan briefly: requested behavior, paths, risk, and verification. Read relevant docs and nearby code.
2. Follow `task` contracts for implementation, regression tests, architecture, security, UI browser/render
   verification, queue ownership, and audit-ledger handling. UI code inspection alone is insufficient.
3. Run standard gates on changed paths without duplicate focused, aggregate, or CI coverage.
   Use `task-verify` only for explicitly uncovered gates.
4. Every QA round needs two independent reviewers against the verbatim request, diff, and broader affected
   behavior/integration surface. Fix actionable findings; behavior changes require fresh affected
   verification and review. No reviewer availability is a blocker, not permission for self-review.

## Commit, landing, output

1. After clean QA, commit explicit paths using project Conventional Commit style. Do not push unless task
   CI/PR lane or user explicitly requires it. Follow parent task landing/cleanup; direct work must land on
   intended base before completion.
2. Drain eligible owned queue items oldest first. Never report done with owned queued, side-worktree, or
   unmerged work; report exact blocker and remaining queue instead.
3. Final response uses `task` Output: changed work, verification, QA counts, status, commit, and risk.
   End with one concise Korean summary sentence.

## Safety

- `complete` requires verification, review, intended commit, landing/cleanup when applicable, and queue drain.
- Do not weaken user/repository constraints to claim zero findings or completion.
