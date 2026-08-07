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
  - Bash(git fetch*)
  - Bash(git ls-remote*)
  - Bash(git push*)
  - Bash(gh*)
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

One small, bounded change that can safely finish in the current context. The `/microtask` input is the goal. Follow `task` for everything this file does not override.

## When to hand off

- Satisfy `task`'s Root cause section before any defect edit. A task may be small while its root fix is not: if the fix crosses into another owning layer, needs isolation, or is high-risk (auth, payments, migrations, CI/release, concurrency, public API, production config, anything irreversible), hand the whole job to `task`. Never shrink the fix, patch the symptom, or add a mitigation just to keep the work in this lane.
- If the fix needs new product direction or authority, stop and ask. If the cause is externally unchangeable, report `blocked` with evidence, owner, and the required action — without adding a workaround while waiting.

## Where to work

1. Read the nearest instructions, git status, and the active goal. Reuse a matching goal; an unrelated one is a conflict.
2. Work in the active parent `task` worktree when one exists; otherwise the current base, but only if it is a branch that permits direct work. Never create a worktree or task branch here. If the only checkout is a protected or default branch, hand off to `task` for the worktree — but the work stays this size. Handing off buys isolation, not ceremony: no reviewer panel, no staged plan, no journal for a change that creates no resources.
3. A dirty tree is fine: preserve unrelated files, stage explicit paths only, and never stash, reset, move, or overwrite user changes. Stop on an unfinished git operation or ambiguous overlapping edits.

## Work

1. Plan briefly: requested behavior, causal evidence, owning layer, paths, verification. The user usually states a symptom, not the fix location — find the layer that owns it and fix there.
2. Run the repo's gates for the changed paths; do not duplicate coverage an aggregate script already provides. For a defect fix, verification must exercise the causal path. For UI work, look at the actual screen when you reasonably can.
3. Review your own diff. Bring in one independent reviewer only for the cases `task`'s Review budget names — and by then you are usually handing off to `task` anyway. A short brief beats a long one.

## Land and report

1. After gates pass, commit explicit paths in the project's Conventional Commit style. Do not commit or push to a protected or default branch; use the parent task or the PR lane. After a rejected or non-fast-forward push, never force push or auto-rebase unrelated work — inspect, then ask.
2. Drain eligible owned queue items oldest first. Never report done with owned queued or unmerged work.
3. Journal microtask-owned resources by task ID outside any removable worktree, and hand the journal to the parent task when one exists. Release only exact matches through the repo's scoped cleanup path; parent-task resources stay with parent finalization. Re-check current use immediately before stopping anything, and treat stopping a container and deleting its volume as separate decisions.
4. Report per `task`'s Output section: what changed, verification, status, commit, and per-resource cleanup with exact identifiers and what deliberately survives. "Cleaned up" without identifiers is not a report. End with one concise Korean summary sentence.

## Safety

- `complete` requires verification, the intended commit, landing and cleanup where applicable, and a drained queue. Apply `task`'s Closure section before every final response.
- Never ship a workaround as completion, even alongside a real fix.
- Do not weaken user or repository constraints to claim completion.
