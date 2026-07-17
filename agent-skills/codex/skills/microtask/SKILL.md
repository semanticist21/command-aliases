---
name: "microtask"
description: "Run /microtask on current task work, else base branch."
metadata:
  short-description: Direct-branch plan, execute, QA
---
# Microtask

Run a bounded task through the same disciplined loop as `task` — plan, execute, verify,
review, commit — with one intentional difference: **microtask creates no new worktree
and no new task branch.** Work inside the current active task worktree when one is still
in progress; otherwise work directly in the caller's current base-branch worktree.

`task` holds the shared contract. This file states only what microtask does differently
and the rules microtask alone carries. Read `task` for anything pointed at below.

## Input

Treat the `/microtask` or `$microtask` argument as the concrete goal. Preserve explicit
constraints, target paths, acceptance criteria, and "do not" instructions.

## Inspect findings as input

`inspect` writes a read-only findings ledger to
`<caller-root>/.agent-tmp/inspect-findings.md` and fixes nothing. When the user points
this microtask at inspect findings (`$microtask fix inspect F2`), read the ledger and act
only on the finding(s) the user selected — inspect lists, the user chooses. Scope each as
one bounded change through the loop below, mark it `status: resolved (<commit>)` when it
lands, and leave the rest `open`. Never stage or commit the ledger under ignored
`.agent-tmp/`. The ledger always lives in the **caller checkout**, even when this
microtask runs inside a parent task worktree — a task worktree does not carry ignored
`.agent-tmp/` files. Read and mark it there.

## Start Gate

Before starting a new microtask, clear or queue against existing task work.

1. Check for an active `task`/`microtask` goal or session, and inspect the repo:
   `git status --short`, `git status --porcelain=v1 -b`, `git worktree list`,
   `git branch --list 'task/*'`.
2. Use `<project-root>/.agent-tmp/task-queue.md` as the queue log. Ensure `.agent-tmp/`
   is ignored before writing. If the project root is unavailable or a safe queue write is
   blocked, keep the request in conversation only and say it was not persisted.
3. If previous task work is complete but left a task worktree, task branch, or unmerged
   commit, finish merge-back **only** when the base branch is known from the
   `base branch` field of `<task-worktree>/.agent-tmp/task-state.md`, an active
   goal/session handoff, or explicit user instruction. If the base is unknown, do not
   guess `main` — stop and ask.
   Run merge-back and cleanup from the **caller's base checkout**, never from inside the
   task worktree; pass the cwd explicitly as `git -C <caller-root> ...`. `git switch
   <base>` fails from inside a task worktree (`fatal: '<base>' is already used by
   worktree at ...`), and `git worktree remove` cannot remove the worktree it is run
   from. Clean up in this order — `git worktree remove <path>` first, then `git branch -D
   <task-branch>` — so git's own worktree guard still refuses to delete a branch that
   another worktree is holding.
4. If task or microtask work is still in progress, queue the new microtask as a sub-item
   of that active work instead of treating it as a fresh base-branch job, and record the
   active worktree/branch context. Do not ask whether to resume later, do not stop with
   queued status, and do not wait for another user prompt. Drain queued microtasks inside
   the same active worktree before the parent's merge-back, so they land with the parent.
5. Cleanup/merge-back is blocked only by a real merge conflict, an unfinished git
   operation, an unknown base, or ambiguous ownership that would require overwriting user
   work. Unrelated dirty files inside an agent-owned task worktree are not a reason to
   leave task garbage: inspect them, classify ownership, split logical commits when
   needed, merge back all owned work, then clean up. If a dirty file is clearly
   external/user-owned and cannot be carried safely, report the exact file and reason.
   Never stash, reset, checkout, force-merge, or overwrite user changes.

## Worktree Choice

Choose the write location before planning:

1. If one owned active unmerged task worktree exists, run or queue the microtask inside
   it as a child scope. If the microtask is unrelated to the parent task, keep it as a
   separate logical commit rather than bundling unrelated changes — but still honor the
   parent's base-branch merge-back and cleanup contract before the final response.
2. If the earlier task work has already merged back, or no active task work exists, use
   the caller's current base-branch worktree.
3. If multiple active task worktrees could own the microtask, stop and ask which parent
   task should receive it. Do not guess from branch names alone.

## Direct Branch Work

For repo-writing work outside an active parent task worktree, current-branch work is the
default contract.

Queued microtask override: owned queued work must start and land on `main` unless the
queue explicitly records a different base. If the current branch is not that target,
switch to or create work from the target before editing, or report the exact blocker. Do
not finish queued microtask work only on a non-target current branch.

1. Resolve the project root with `git rev-parse --show-toplevel` when possible.
2. Record the current branch with `git branch --show-current` and treat it as the base
   branch receiving the work. If detached, ask for the intended base before any repo write.
3. Inspect `git status --short` and `git status --porcelain=v1 -b` before planning.
   Include relevant dirty-tree status in any agent briefs.
4. Stop before repo writes if a merge, rebase, cherry-pick, revert, or bisect is in
   progress. Direct-branch edits during an unfinished git operation are more dangerous
   than isolated worktree edits.
5. Do not create a sibling worktree, task branch, or merge-back flow. Do not call
   `git worktree add` unless the user explicitly redirects away from microtask semantics.
6. Protect pre-existing changes. Do not stash, reset, checkout, clean, reformat, stage, or
   overwrite unrelated dirty files. If the work would need to edit a file the user already
   modified, read it and work with the existing changes only when the intent is clear; if
   the overlap is ambiguous, stop and ask.

## Goal Tracking

Follow `task`'s Goal Tracking contract unchanged: use the platform goal mechanism
(`get_goal`/`create_goal` in Codex, `/goal` in Claude) before planning, reuse a matching
active goal, report an unrelated active goal as a conflict instead of replacing it, and in
Codex use `update_goal` only for the terminal `complete`/`blocked` states.

Microtask delta: mark `complete` only after verification, review, the intended commit,
merge-back/cleanup **when a parent task worktree is involved**, and owned queue drain are
all done.

## Queue Drain

Follow `task`'s Queue Drain contract unchanged: queued items are already user-approved
work, so never ask whether to run one, never stop with queued-only status, and never wait
for another prompt. Every owned queue item records a target base branch (inherit the
parent task's recorded base; otherwise `main` unless the user names another). Ownership
lasts until the item is fully landed or a real blocker is reported, and a final response
may not claim "done" while an owned item remains only in `.agent-tmp/task-queue.md`, a
side worktree, or an unmerged branch — report the exact blocker and the remaining queue,
otherwise keep draining. Never drain entries clearly owned by another agent/session or
project root.

Microtask delta: run `task`'s drain procedure — oldest eligible item first, marked
in-progress so it cannot run twice, marked completed with landed commit/base details —
before sending the final response, rather than at a parent task's finalization
checkpoints. With no active parent task, finish this microtask's commit and cleanup
first, then start the queued task from its recorded base.

## Loop

Run `task`'s Loop unchanged — Planning, Execute, QA + Verification, Commit — including its
`coding-rule`/`design` skill loads, its test and regression-test rules, its UI
visible-information duplication pass, its coding-convention review, its Conventional
Commit style, and its Agent Briefing, Agent Use, and Output contracts.

Two of its rules are restated because they are the ones most often skipped:

- **Two independent reviewers, every round.** A QA round is not a one-time sign-off: any
  behavior-affecting fix invalidates the previous pass, so rerun both reviewers on the
  updated diff. Stop only when both return **0 findings**, or every remaining finding from
  both is documented invalid/non-actionable with a concrete reason. If two independent
  reviewers are unavailable, report that as a blocker — self-review is not QA-clean.
- **UI changes require live browser verification**, not code inspection alone. If the
  required browser path is unavailable after its documented retry/recovery steps, report
  that blocker rather than silently substituting another.

Microtask deltas:

- **Write and commit location** — the active parent task worktree's branch, or the
  caller's current base branch for direct work. Never a new worktree or task branch.
- **Staging** — stage only files this microtask changed, by explicit path. Direct-branch
  work routinely runs in a dirty tree, so blanket-staging is never acceptable here.
  Re-check `git status` after committing to confirm the intended files landed and nothing
  unexpected is staged.
- **Report** in `task`'s Output shape, and state the final goal status plus any owned
  queue item still outstanding.

## Safety

- `microtask` means no new worktree and no new task branch by default.
- Do not use destructive git commands.
- Do not move, stash, reset, or overwrite user changes.
- Do not push unless explicitly asked.
- Do not ignore user or harness constraints to claim "0 findings".
