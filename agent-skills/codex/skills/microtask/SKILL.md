---
name: "microtask"
description: "Run /microtask on current task work, else base branch."
user-invocable: true
argument-hint: "<small task goal constraints>"
metadata:
  short-description: Direct-branch plan, execute, QA
---

# Microtask

Run a bounded task through the same disciplined loop as `task`: plan, execute,
verify, review, and commit when appropriate. Use skills and agents/subagents
actively whenever they help. The difference is intentional:
**do the work inside the current active task worktree when one is still in
progress; otherwise work directly in the caller's current base-branch
worktree. Do not create a new task worktree or task branch for microtask
itself.**

## Input

Treat `/microtask` or `$microtask` argument as the concrete goal. Preserve explicit
constraints, target paths, acceptance criteria, and "do not" instructions.

## Start Gate

Before starting a new microtask, clear or queue against existing task work:

1. Check for an active `task` or `microtask` goal/session and inspect the repo with
   `git status --short`, `git status --porcelain=v1 -b`, `git worktree list`, and
   `git branch --list 'task/*'`.
2. Use `<project-root>/.agent-tmp/task-queue.md` as the default queue log. Ensure
   `.agent-tmp/` is ignored before writing. If project root is unavailable or a
   safe queue write is blocked, keep the queued request in conversation only and
   say it was not persisted.
3. If previous task work is complete but left a task worktree, task branch, or
   unmerged commit, finish merge-back only when the base branch is known from
   `<task-worktree>/.agent-tmp/task-state.md`, an active goal/session handoff, or
   explicit user instruction. Then remove the worktree and delete the task branch
   before planning new work. If the base is unknown, do not guess `main`; stop and
   ask.
4. If previous task or microtask work is still in progress, queue the new
   microtask as a sub-item of that active work instead of treating it as a fresh
   base-branch job. Record the active worktree/branch context. Do not ask whether to resume later, do not stop with queued status, and do not wait for another user prompt. Before parent task merge-back/cleanup, drain queued microtasks inside the same active worktree so they land with the parent task.
5. Cleanup/merge-back is blocked only by real merge conflicts, unfinished git
   operation, unknown base, or ambiguous ownership that would require overwriting
   user work. Unrelated dirty files inside an agent-owned task worktree are not a
   reason to leave task garbage: inspect them, classify ownership, split logical
   commits when needed, merge back all owned work, then clean up. If dirty file is
   clearly external/user-owned and cannot be carried safely, report exact file and
   reason. Never stash, reset, checkout, force-merge, or overwrite user changes.

## Worktree Choice

Choose the write location before planning:

1. If one owned active unmerged task worktree exists, run or queue the microtask
   inside that task worktree as a child scope. If the microtask is unrelated to
   the parent task, keep it as a separate logical commit rather than bundling
   unrelated changes, but still honor the parent task's base-branch merge-back
   and cleanup contract before final response.
2. If the earlier task work has already merged back, or no active task work
   exists, use the caller's current base branch worktree.
3. If multiple active task worktrees could own the microtask, stop and ask which
   parent task should receive it. Do not guess from branch names alone.

## Direct Branch Work

For repo-writing work outside an active parent task worktree, current-branch work
is the default contract.

Queued microtask override: owned queued work must start and land on `main`
unless the queue explicitly records a different base. If the current branch is
not that target, switch to or create work from the target before editing, or
report the exact blocker; do not finish queued microtask work only on a
non-target current branch.

1. Resolve project root with `git rev-parse --show-toplevel` when possible.
2. Record current branch with `git branch --show-current`; treat it as the base
   branch receiving the work. If detached, ask for the intended base before
   making repo writes.
3. Inspect `git status --short` and `git status --porcelain=v1 -b` before
   planning. Include relevant dirty-tree status in any agent briefs.
4. Stop before repo writes if a merge, rebase, cherry-pick, revert, or bisect is
   in progress. Direct-branch edits during an unfinished git operation are more
   dangerous than isolated worktree edits.
5. Do not create a sibling worktree, task branch, or merge-back flow. Do not call
   `git worktree add` unless the user explicitly redirects away from microtask
   semantics.
6. Protect pre-existing changes. Do not stash, reset, checkout, clean, reformat,
   stage, or overwrite unrelated dirty files.
7. If the requested work would need to edit a file already modified by the user,
   read the file and work with the existing changes only when the intent is clear.
   If the overlap is ambiguous, stop and ask.
8. Stage only files changed for this microtask by explicit path. Never
   blanket-stage in a dirty tree.
9. Do not push unless explicitly asked.

## Goal Tracking

Use the platform goal mechanism by default.

- In Codex, call `get_goal` before planning. If no goal is active, call
  `create_goal` with a concise objective. If an active goal matches this
  microtask, reuse it. If an unrelated goal is active, report the conflict and do
  not replace it.
- In Claude, use `/goal` before planning to create or select the task goal. If an
  unrelated goal is active, report the conflict before changing it.
- In Codex, use `update_goal` only for terminal states: `complete` or `blocked`.
- Mark `complete` only after verification, review, intended commit,
  merge-back/cleanup when applicable, and owned queue drain are done. If any
  required lifecycle step is blocked, report blocker and keep the goal active
  unless the repeated-blocker rule below is satisfied; never mark blocked work
  `complete`.
- Mark `blocked` only when the same blocker has repeated across required goal
  turns and no meaningful progress is possible without user input or an external
  state change. Do not mark budget exhaustion or partial progress as complete.

## Queue Drain

Queued task or microtask requests are already user-approved work. Once an item is
recorded in `<project-root>/.agent-tmp/task-queue.md`, do not ask whether to run
it, do not stop with queued-only status, and do not wait for user to prompt again.

When recording an owned queue item, include its target base branch. Inherit the
active parent task's recorded base when one exists; otherwise record `main`
unless the user explicitly names a different base. Do not leave owned queue
items with an implicit or unknown base.

Queue ownership is part of microtask/task ownership, not a reminder list. If
this agent/session writes a queue item, accepts explicit user queued work, or
acknowledges an item as owned while running task/microtask work, it owns that
item until it is fully landed or a real blocker is reported. "Fully landed" means:

- queued `task` work has passed QA, committed on its task branch, squash-merged
  into `main` unless queue explicitly records a different base, and cleaned up
  its task worktree/branch;
- queued `microtask` work has passed QA and committed into the active parent
  task worktree or target base branch (`main` unless queue explicitly records a
  different base), then any active parent task is merged back into that target
  base and cleaned up before final response;
- no owned pending/in-progress queue item, unmerged task branch, or task
  worktree is left behind silently at final response.

Do not tell the user a microtask/task is "done" while owned queue items remain
only in `.agent-tmp/task-queue.md`, a side worktree, or an unmerged branch. If
a queued item is blocked by unrelated dirty files, conflicts, auth, or missing
external state, report that exact blocker and the remaining queue; otherwise
keep draining.

Before sending a final response after completing current microtask:

1. Re-open `<project-root>/.agent-tmp/task-queue.md`.
2. If pending items exist, choose the oldest item eligible for the current
   lifecycle stage, mark it in-progress or remove it from pending list so it
   cannot run twice, and execute it by declared mode. While an active parent
   task is unmerged, scan past queued `task` items and drain all eligible
   `microtask` items for that parent before parent merge-back. Run queued `task`
   items only after current parent task is committed, merged back, and cleaned
   up; then start next task from `main` unless queue explicitly records a
   different base.
   If no active parent task exists, finish the current microtask commit and
   cleanup first, then start the queued task from its recorded target base.
3. When that item completes, mark it completed with landed commit/base details,
   then repeat from step 1.
4. Send final response only when queue empty or a real blocker prevents meaningful
   progress. Report blocker and remaining queued item(s).

Do not drain queue entries clearly owned by another agent/session or project root.
Treat them external and leave untouched.

## Agent Briefing

Every delegated agent gets real task context:

- original user goal and constraints
- relevant repo instructions, target paths, ownership boundaries, and git status
- assigned scope and out-of-scope boundaries
- acceptance criteria, verification commands, and expected output format
- files the agent must read first

For small one-shot agent calls, put the brief directly in the prompt. For
multi-agent or high-context work, write a neutral brief under
`<project-root>/.agent-tmp/`, keep `.agent-tmp/` ignored, and do not stage those
temporary files.

Reviewer agents get the goal, acceptance criteria, and diff directly. Do not coach
reviewers toward a desired verdict.

## Loop

### 1. Planning

- Read nearest `AGENTS.md`/`CLAUDE.md` and relevant harness docs.
- Inspect repo shape and current git status.
- If modifying code, load the `coding-rule` skill before planning and include
  minimal-code, no speculative extraction/export, and project-version convention
  rules in acceptance criteria.
- If creating or modifying UI screens, load the `design` skill before planning and
  include non-duplication, minimalism, conventional UX, and live verification in
  acceptance criteria.
- Use agents for exploration/planning when the task is non-trivial.
- Produce a short plan, acceptance criteria, and verification commands.

### 2. Execute

- Implement in small, reviewable changes on the current branch.
- Prefer existing project patterns and narrow edits.
- After writing code, add tests on the project's test surface when the work is
  testable: pure functions, mappers, validators, parsers, serializers, and
  behavior changes. Mirror the project's test framework, layout, and conventions.
  For bugs, add a regression test that fails before the fix and passes after.
  Skip tests only for markup/visual-only edits, trivial typos, or projects with no
  usable test setup, and say why.
- Delegate isolated edits or file discovery when it reduces risk.
- Update durable docs only when the user asked or the repo's local instructions
  require it for reusable technical facts.

### 3. QA + Verification

Run the loop until findings are zero, valid/actionable findings are zero, or a
clear blocker remains.

1. Run deterministic checks first: relevant tests, typecheck, lint, build, harness
   checks, and `git diff --check` where available.
2. UI changes require live browser verification, not code inspection alone. In
   Codex, attempt Chrome Plugin verification first: load Chrome control skill,
   connect the user's Chrome extension backend, open or reload the changed route,
   and inspect actual rendered screen DOM or screenshot evidence. If Chrome
   Plugin is unavailable after its documented retry/recovery steps, do not
   silently substitute another browser path; report the Chrome blocker and use an
   explicitly labeled fallback only when the user did not require Chrome.
3. Run at least **two independent QA/reviewer agents** over the diff and
   acceptance criteria in every QA round. This is a loop, not a one-time
   sign-off: after each fix round, rerun fresh QA/reviewer agents or explicitly
   continue both reviewers with the updated diff. Stop only when both reviewers
   return `0 findings`, or all remaining findings from both reviewers are
   documented as invalid/non-actionable with concrete reason.
   If two independent reviewer agents are unavailable, report that as a blocker;
   do not substitute self-review and do not call the work QA-clean.
4. For UI changes, check visible information duplication in rows, cards, modals,
   headers, empty states, badges, and CTAs.
5. Review coding-convention adherence against nearby docs and files.
6. Convert issues into severity-tagged findings with file/line where possible.
7. Fix actionable findings and re-run verification.
8. Repeat until both reviewers return **0 findings** or **0 valid/actionable
   findings**.
9. If findings remain after three QA rounds, continue while progress is still
   clear. If blocked, report the exact blocker, attempted fixes, invalidated
   findings with reasons, and remaining valid findings.

### 4. Commit

Once QA returns **0 findings** or **0 valid/actionable findings**, and
verification is green:

1. Stage only files this microtask changed, using explicit paths.
2. Write one or more Conventional Commits grouped by concern. Check
   `git log --oneline -10` for local style. For non-trivial splitting, delegate to
   the `commit` skill.
3. Commit on the current base branch.
4. Re-check `git status` after committing to confirm intended files landed and
   nothing unexpected is staged.

Skip commit only if the microtask made no file changes, the user said not to
commit, or committing is blocked. Say why.

## Agent Use

- Use agents for exploration, planning, implementation slices, and review whenever
  task size or risk justifies it.
- Keep the main thread as orchestrator: merge agent outputs, decide scope, apply
  final judgment, verify.
- Prefer reviewer agents for final QA on meaningful changes.

## Output

Final response should include:

- what changed
- verification commands/results
- QA loop count, total final finding count, and valid/actionable final finding
  count (`0` when complete)
- final goal status (`complete`, `blocked`, or still active with why)
- commit subject(s), or why no commit was made
- any residual risk or explicit blocker

## Safety

- `microtask` means no new worktree and no new task branch by default.
- Do not use destructive git commands.
- Do not move, stash, reset, or overwrite user changes.
- Do not push unless explicitly asked.
- Do not ignore user or harness constraints to claim "0 findings".
