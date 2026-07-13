---
name: "task"
description: "Run repository-changing tasks and any plan that assumes repository changes—including Plan mode and plan-only requests—in an isolated prepared worktree through planning, implementation, QA, merge-back, and cleanup."
metadata:
  short-description: Plan, execute, QA until valid findings zero
---
# Task

Act as the orchestrator above the work. Run the user's task through a three-stage
loop: plan, execute, then QA/verify. Use agents/subagents actively whenever they are
available and useful. Do not stop until QA findings are zero, valid/actionable
findings are zero, or the task is truly blocked. A user-defined budget/limit may
pause only after owned queue items are fully landed or the exact blocker and
remaining queue are reported.

## Input

Treat the `/task` or `$task` argument as the concrete goal. Preserve explicit
constraints, target paths, acceptance criteria, and "do not" instructions.

## Plan-only requests

When the user explicitly asks for a plan without implementation, still create the
goal and prepared task worktree before implementation-file inspection or detailed
planning. Run only the Planning stage; do not execute, run implementation QA, or
commit. After the plan is ready but before delivering it, run the bundled cleanup
helper from the caller worktree:

```bash
node ~/.codex/skills/task/scripts/task-worktree-plan-cleanup.mjs --repo "<caller-root>" --worktree "<task-worktree>" --branch <task-branch> --head <creation-commit>
```

The helper revalidates tracked state and ignored setup artifacts across recursive
submodules, deinitializes only clean submodules, quarantines the worktree path,
and removes only unchanged ignored setup artifacts. It uses Git's non-force
dirty-worktree check for ordinary worktrees and scoped force only after clean
submodule deinitialization, then deletes the branch with an atomic expected-ref
check. The guard
permits only this exact state-bound command. Never discard changes to force
cleanup; report the exact unexpected state instead. Mark the planning goal
complete only after clean worktree and branch cleanup, then deliver the plan.

## Mechanical worktree guard

Install `scripts/task-worktree-guard.mjs` as `UserPromptSubmit` (`.*`),
`PreToolUse` (`Bash|apply_patch|Edit|Write|MultiEdit`), `PostToolUse` (`Bash`),
`PostToolUseFailure` (`Bash`), and `Stop` (`.*`) hooks.
Use `node scripts/install-task-worktree-guard.mjs codex` for an idempotent install
that preserves existing hook entries.
The prompt hook activates for explicit `$task` or `/task` invocations. For an
implicit skill selection, the exact worktree creator command atomically activates
the same guard before reserving its branch. The tool hook then denies writes in
the caller checkout until the tool runs from a different worktree on a `task/*`
branch. The Stop hook clears state after the
recorded task worktree has been removed.
Safe startup reads may be batched with `&&`; the successful `git worktree add`
binds the session to that exact worktree, including when the target repository
differs from the caller repository.
The guard also permits only the exact bundled `task-worktree-create.mjs`
invocation described below. It binds the one new matching worktree after success
or after a later dependency-setup failure, so recovery continues inside that
worktree instead of creating another one.
For plan-only cleanup it permits only the exact state-bound
`task-worktree-plan-cleanup.mjs` invocation described above.
Guard state lives in `~/.codex/task-worktree-guard-state/`, expires after 24
hours of inactivity, and self-clears when its bound worktree disappears.
If an activated task is abandoned, submit `task-cancel`, `/task-cancel`, or
`$task-cancel` to release the session guard explicitly.

The guard is mandatory when the runtime supports these hooks. Do not treat it as
an OS security boundary: Codex documentation says some unified-exec paths are not
fully intercepted. Keep the workflow rules below as a second enforcement layer.

## One-command changed-surface verification

After merging the recorded local base into the task worktree, prefer the bundled
verifier for the final deterministic gate:

```bash
cd <task-worktree> && node ~/.codex/skills/task/scripts/task-verify.mjs --base <recorded-base>
```

It discovers changed JavaScript packages and Rust crates, then runs each available
package-level test, lint, typecheck/check, and build command once. Rust crates with
soft-skipping DB integration tests require `DATABASE_URL`; detected
`skip: no local postgres`-style output fails the verifier even when the test
process exits zero. Results are written to the ignored
`.agent-tmp/task-verification.json` receipt.

The verifier is standalone and remains the source of verification evidence when
the current Codex surface does not dispatch hooks. When hooks are available, the
guard recognizes this exact command and repeats it in a merge-time denial message.

Use `--dry-run` only to inspect the command plan; it never satisfies merge
verification. Project-owned canonical verification commands still win when they
cover additional stacks or services. Run those in addition to this verifier.
A pre-existing or out-of-scope red gate explains the failure but never turns it
green: fix it within scope or report the task blocked.


## Start Gate

Before starting a new task, clear or queue only against task work owned by this agent/session:

1. Check for an active `task` or `microtask` goal/session and inspect the repo with
   `git status --short`, `git status --porcelain=v1 -b`, `git worktree list`, and
   `git branch --list 'task/*'`. Treat unrelated sibling task worktrees/branches created by other agents as context only, not blockers.
   Ownership evidence means an active current goal/session that names or matches the discovered task worktree/branch/path, a task-state owner/session marker matching this run, or an explicit handoff/user instruction naming that task work as yours. If a task worktree lacks that evidence, treat it as another agent's context, not stale local work.
2. Use `<project-root>/.agent-tmp/task-queue.md` as the default queue log. Ensure
   `.agent-tmp/` is ignored before writing. If project root is unavailable or a
   safe queue write is blocked, keep the queued request in conversation only and
   say it was not persisted.
3. If previous task work owned by this agent/session is complete but left a task worktree, task branch, or
   unmerged commit, finish merge-back only when the base branch is known from
   `<task-worktree>/.agent-tmp/task-state.md`, an active goal/session handoff, or
   explicit user instruction. Then remove the worktree and delete the task branch
   before planning new work. If the base is unknown for your own leftover task, do not guess `main`; stop and
   ask.
4. If previous task or microtask work owned by this agent/session is still in progress, do not start new
   task immediately unless the user explicitly says to proceed from committed
   `HEAD` / the last commit. In that override case, leave the existing task
   worktree and branch untouched, treat them as read-only external state, and
   continue the new task through Worktree Isolation from current `HEAD`.
   Otherwise queue it explicitly. Do not ask whether to resume later, do not stop
   with queued status, and do not wait for another user prompt. Before parent task
   merge-back/cleanup, drain queued `microtask` items using **Queue Drain**.
   Leave queued `task` items pending until the parent task is committed,
   merged back, and cleaned up; then drain them from `main` unless queue
   explicitly records a different base.
5. Cleanup/merge-back is blocked only by real merge conflicts, unfinished git
   operation, unknown base, or ambiguous ownership that would require overwriting
   user work. Unrelated dirty files inside an agent-owned task worktree are not a
   reason to leave task garbage: inspect them, classify ownership, split logical
   commits when needed, merge back all owned work, then clean up. If dirty file is
   clearly external/user-owned and cannot be carried safely, report exact file and
   reason. Never stash, reset, checkout, force-merge, or overwrite user changes.

## Worktree Isolation

**Mandatory prepared-worktree bootstrap.** For repo-writing tasks and
repository-changing implementation plans, including Plan mode and plan-only
requests, run this as the normal startup path before implementation-file
inspection or detailed planning:

```bash
node ~/.codex/skills/task/scripts/task-worktree-create.mjs <slug> --id <unique-id> --repo <repo-root> --summary "<task summary>"
```

Generate one lowercase filesystem-safe unique ID for the invocation, preferably
from the platform session plus current UTC timestamp. If the guard reports an ID
collision, generate a new ID; never reuse or take over the existing worktree.
The script creates the isolated task worktree, records task state, initializes
recursive submodules, and installs dependencies from recognized tracked lockfiles
across the superproject and every initialized submodule. JavaScript package
installs disable repository lifecycle/build scripts during bootstrap. A raw
`git worktree add` is recovery-only when the script is unavailable or fails
before creating a worktree. If setup fails after creation, keep and use that
created worktree and repair setup there; never create a second worktree or fall
back to the caller checkout.
For a plan-only request, append `--plan-only`; this is required for the guard's
clean no-commit removal path.

**HEAD worktree default.** For new repo-writing tasks, caller worktree state almost never blocks. If committed `HEAD` exists and `git worktree add ... HEAD` can create an isolated task worktree, do it without asking, regardless of caller dirty files, staged files, unmerged paths, merge/rebase/cherry-pick/bisect state, or unrelated task branches. Treat caller tree read-only and proceed from last commit. Ask only when user explicitly says task must include current uncommitted/unmerged changes or explicitly asks work in current tree. If even this rare path fails (no `HEAD`, path/branch collision, transient git lock), report waiting state, sleep/check periodically, and retry until user redirects or the condition clears; do not mark blocked immediately.

Operational/exploratory work that should not create a commit or leave `git log` history does not need a task worktree; run in caller context while preserving user changes.

For any repo-writing task, the task worktree is a mandatory pre-planning
gate, not a preference. Do not inspect implementation files, draft a detailed
plan, edit files, run generators, or start subagents until the gate below has
either created a task worktree or produced an explicit blocked/no-worktree
decision. The caller's current tree is read-only until merge-back.

**Hard fail guard.** If task will write repo files and no task worktree exists,
do not continue in caller checkout. Stop, say worktree isolation failed, and
recover by creating the task worktree before any edit or commit. Continuing to
edit current checkout is a task-skill violation, even when staging explicit
pathspecs would avoid unrelated files.

1. Resolve the repository that owns the files to be written, then its root with
   `git rev-parse --show-toplevel`. Explicit target paths and named skill sources
   override the caller repository. For cross-repository work, run the guarded
   `git worktree add` against that target repository so the session binds to the
   created worktree instead of an unrelated existing `task/*` worktree.
2. Record caller's current branch with `git branch --show-current`; this is the
base branch task work must merge back into after commit. If detached, resolve
intended base from user prompt or stop and ask.
3. Inspect `git status --short` and `git status --porcelain=v1 -b` before
   creating the worktree and include that status in agent briefs. Do not move,
   stash, reset, or otherwise alter pre-existing dirty files in the caller's
   working tree.
4. Worktree creation is required when all are true:
   - repo is a git repo with a resolved branch base, not detached or unborn
   - task will write repo files
   - user did not explicitly ask to work in the caller's current tree
   - sibling worktree path and `task/<slug>-<unique-id>` branch name are unused
5. If caller tree is dirty, do not treat that as a blocker when a worktree can be
   created from committed `HEAD`. The default is to ignore caller-tree dirty
   files, branch from the last commit, include the dirty status in briefs, and
   treat the original tree as read-only context. Ask only when the user
   explicitly says the task must incorporate uncommitted tracked changes or
   untracked files, or explicitly asks to work in the current tree.
6. Use the prepared-worktree bootstrap above. It creates a sibling worktree from
   current `HEAD` on `task/<slug>-<unique-id>` and keeps the slug short,
   lowercase, and filesystem-safe. Use
   `git worktree add -b task/<slug>-<timestamp> ../<repo>-task-<slug>-<timestamp> HEAD`
   only as the documented recovery path.
7. Immediately record task state in
   `<task-worktree>/.agent-tmp/task-state.md`: base branch, task branch,
   worktree path, original caller path, created time, task summary, and mandatory owner/session marker. If no platform session id is available, derive a stable marker from runtime name + created timestamp + caller path + concise task summary. Keep
   `.agent-tmp/` ignored and never stage it.
8. Run planning, edits, tests, QA, and commit inside the task worktree. Treat the
   original working tree as read-only task context unless the user explicitly asks to
   apply changes there.
   In Codex unified exec, prefix every shell command with
   `cd <task-worktree> &&` because the hook payload may omit the tool API's
   `workdir` field even when execution itself honors it.
9. Skip worktree creation only when the safety gate fails, the user explicitly
   asks not to use a worktree, the repo is not a git repo, the task is
   read-only/no-file-change, or `git worktree add` fails. If the task still
   needs repo writes, do not fall back to `main`/the caller's branch just
   because it would be convenient. Stop and report the exact no-worktree
   reason, unless the user explicitly approves current-tree work after seeing
   that reason.
10. After QA passes and task branch committed, merge it back into recorded
   base branch (`main`, `dev`, or branch caller started from) without asking
   for second approval. This merge-back part default task lifecycle; do not
   finish while silently leaving completed work only in worktree branch.
   This merge-back is the only normal moment when task changes should land on
   `main`/the caller's branch. All planning, edits, tests, QA, and task-branch
   commit happen in the task worktree first.
   - The recorded local base branch is authoritative for finalization. Immediately
     before final consistency checks, capture its current local tip and run the exact
     `git merge --no-edit <recorded-base>` inside the task worktree. An already-up-to-date
     merge counts. Stop and report any conflict; never guess another base or force-resolve
     it. Treat the merge as a content change that invalidates all earlier verification.
     Audit consistency on the merged HEAD and rerun the full test, lint, typecheck, and
     build gates before squash. If the local base tip changes afterward, repeat the base
     merge and every gate. Fetching alone does not advance the recorded local base.
   - Squash-merge into base
     (`git switch <base> && git merge --squash <task-branch> && git commit`),
     then remove worktree with `git worktree remove <path>` and delete the
     task branch with `git update-ref -d refs/heads/<task-branch> <verified-task-head>` after confirming the
     squash commit exists. Confirm worktree removal and branch deletion.
     Reuse task branch commit subject appropriate, keep final base history one commit.
   - Task cleanup mandatory: do not mark task complete while this task's worktree or
     `task/<slug>-<timestamp>` branch still exists. Unrelated sibling task worktrees/branches owned by other agents do not block completion. If branch deletion fails,
     stop and report exact cleanup blocker.
   - Before merge-back, re-check base worktree status. If unrelated dirty files
     exist, continue only when merge can be done without staging, reverting, or
     overwriting them; otherwise stop/report exact blocker.
     Never stash, reset, or force-resolve user changes.
   - Cleanup clarification: unrelated dirty files in an agent-owned task worktree
     are not a reason to leave task garbage. Inspect them, classify ownership,
     split logical commits when needed, merge back all owned work, and clean up.
     If normal `git worktree remove` fails only because ignored/generated
     leftovers remain, verify tracked status is clean and use scoped force
     cleanup for that task worktree.
   - Stop/report on merge conflict; never force-resolve. Do not push unless
     explicitly asked.

## Goal Tracking

Use the platform goal mechanism by default for every task run.

- Create the goal from the concrete objective, not the full raw argument when it
  contains paths, constraints, or "do not" clauses. Preserve those details in the
  task context and acceptance criteria.
- In Codex, call `get_goal` before planning. If no goal is active, call
  `create_goal`. If the active goal matches this task, reuse it. If an unrelated
  goal is active, report the conflict and do not call `create_goal`.
- In Claude, use `/goal` before planning to create or select the task goal. If an
  unrelated goal is active, report the conflict before changing it.
- Report progress in normal task updates. Do not use goal status commands for
  planning/execution/QA/commit progress unless the platform explicitly supports
  non-terminal progress states.
- In Codex, use `update_goal` only for terminal states: `complete` or `blocked`.
  Mark `complete` only after QA is clean or valid/actionable findings are zero,
  and commit, merge-back/cleanup, and owned queue drain are done. If any required
  lifecycle step is blocked, report blocker and keep the goal active unless the
  repeated-blocker rule below is satisfied; never mark blocked work `complete`.
- Mark `blocked` only when the same blocker has repeated across the required goal
  turns and no meaningful progress is possible without user input or external state
  change. Caller-tree dirty files are not a blocker when the task worktree can be
  created from committed `HEAD`; proceed from the last commit instead. Do not mark
  budget exhaustion or partial progress as complete.

## Queue Drain

Queued task or microtask requests are already user-approved work. Once an item is
recorded in `<project-root>/.agent-tmp/task-queue.md`, do not ask whether to run
it, do not stop with queued-only status, and do not wait for user to prompt again.

When recording an owned queue item, include its target base branch. Inherit the
active parent task's recorded base when one exists; otherwise record `main`
unless the user explicitly names a different base. Do not leave owned queue
items with an implicit or unknown base.

Queue ownership is part of task ownership, not a reminder list. If this
agent/session writes a queue item, accepts explicit user queued work, or
acknowledges an item as owned while running task/microtask work, it owns that
item until it is fully landed or a real blocker is reported.
"Fully landed" means:

- queued `task` work has passed QA, committed on its task branch, squash-merged
  into `main` unless queue explicitly records a different base, and cleaned up
  its task worktree/branch;
- queued `microtask` work has passed QA and committed into the active parent
  task worktree or target base branch (`main` unless queue explicitly records a
  different base), then the parent task itself is merged back into that target
  base and cleaned up before final response;
- no owned pending/in-progress queue item, unmerged task branch, or task
  worktree is left behind silently at final response.

Do not tell the user a task is "done" while owned queue items remain only in
`.agent-tmp/task-queue.md`, a side worktree, or an unmerged branch. If a queued
item is blocked by unrelated dirty files, conflicts, auth, or missing external
state, report that exact blocker and the remaining queue; otherwise keep
draining.

At finalization checkpoints and before sending a final response:

1. Re-open `<project-root>/.agent-tmp/task-queue.md`.
2. If pending items exist, choose the oldest item eligible for the current
   lifecycle stage, mark it in-progress or remove it from pending list so it
   cannot run twice, and execute it by declared mode. While an active parent
   task is unmerged, scan past queued `task` items and drain all eligible
   `microtask` items for that parent before parent merge-back. Run queued `task`
   items only after current parent task is committed, merged back, and cleaned
   up; then start next task from `main` unless queue explicitly records a
   different base.
   If no active parent task exists, finish the current task/microtask commit
   and cleanup first, then start the queued task from its recorded target base.
3. When that item completes, mark it completed with landed commit/base details,
   then repeat from step 1.
4. Send final response only when queue empty or a real blocker prevents meaningful
   progress. Report blocker and remaining queued item(s).

Do not drain queue entries clearly owned by another agent/session or project root.
Treat them external and leave untouched.

## Agent Briefing

Every delegated agent must receive the real task context, not a vague summary.
Before spawning an agent, prepare a brief with:

- original user goal and exact constraints
- relevant repo instructions, target paths, ownership boundaries, and current git status
- scope assigned to that agent and what is explicitly out of scope
- acceptance criteria, verification commands, and expected output format
- any files the agent must read first

For small one-shot agent calls, put that brief directly in the agent prompt. For
multi-agent, long-running, or high-context work, write a project-local handoff doc
and tell every agent to read it before acting:

1. Resolve the project root with `git rev-parse --show-toplevel` when possible.
2. Use `<project-root>/.agent-tmp/` as the shared temporary task directory.
3. If it does not exist, create it.
4. Ensure `.agent-tmp/` is ignored at the project root. If no existing ignore rule
   covers it, add the line `.agent-tmp/` to `<project-root>/.gitignore`; create
   `.gitignore` if needed.
5. Write a concise brief such as `<project-root>/.agent-tmp/task-brief.md` or
   `<project-root>/.agent-tmp/<task-slug>.md`.
6. Keep the brief neutral: goal, constraints, scope, commands, and factual context.
7. Update the brief when scope or acceptance criteria change.
8. Keep implementation notes or hypotheses separate when they could bias a reviewer.
9. Do not stage or commit files under `.agent-tmp/`.

Agent prompts must point at the brief path and restate the agent's slice in the
prompt itself. Reviewer agents get the goal, acceptance criteria, and diff directly;
do not ask them to read biased implementation notes, leak hidden conclusions, or
coach them toward a desired verdict.

## Loop

### 1. Planning

- Read the nearest `AGENTS.md`/`CLAUDE.md` and relevant harness docs.
- Inspect the repo shape and current git status.
- For tasks that create or modify code, load the `coding-rule` skill before planning
  and include its minimal-code, no speculative extraction/export, and project-version
  convention rules in the acceptance criteria.
- For tasks that create or modify UI screens, load the `design` skill before planning
  and include its non-duplication, minimalism, and conventional UX rules in the
  acceptance criteria. Acceptance criteria must reject repeated visible
  information inside the same row/card/modal, such as the same status appearing
  in both helper text and a badge. Also check row/card spatial hierarchy:
  primary content leads, secondary details support it, and status/actions
  occupy trailing or distinct slots.
- If subagents are available, delegate exploration/planning for non-trivial tasks:
  - investigator: locate relevant files, owners, conventions, risk areas.
  - planner: propose steps and acceptance checks.
- Make tests part of acceptance criteria by default: the plan must name which component
  and unit tests the change will add/extend (or explicitly justify why none apply).
- Produce a short plan with acceptance criteria and verification commands.

### 2. Execute

- Implement the plan in small, reviewable changes.
- Prefer existing patterns and narrow edits.
- **Always write tests for what you changed — maximize coverage of the changed surface,
  not the bare minimum.** Whenever the project has a test surface, add the related tests
  by default:
  - **Component tests** for UI-logic changes in `.tsx`/component files — event handlers,
    guard conditions, conditional rendering, presence/absence of buttons and states.
    These logic bugs are invisible to util-only tests; cover them with the project's
    component-test harness (e.g. `*.test.tsx` with `@testing-library/react`).
  - **Unit tests** for pure functions, mappers, validators, parsers, serializers, view
    models, and any behavior change.
  - For a bug, add a regression test that fails before the fix and passes after.
  Mirror the project's test framework, layout, and conventions (check
  `package.json`/`Cargo.toml`/test dirs and neighbor test files to confirm what harness
  is enabled). Skip a test only for purely visual/style/copy edits with no logic, trivial
  typos, or projects with no test setup — and say explicitly why it was skipped.
- For stateful or sequenced behavior, write the observable transition path before testing
  (for example: idle → accepted → in progress → success/failure/canceled). Cover each
  user-visible state and every observable boundary between consecutive operations, including
  the state after operation A succeeds but before operation B finishes. Explicitly justify
  any boundary that is unobservable or inapplicable. An all-immediate
  mock does not prove intermediate behavior; use controllable promises, clocks, deferred
  responses, or an equivalent harness to hold and assert non-terminal states.
- Delegate isolated edits or parallel file discovery to agents when it saves context
  or reduces risk.
- Update durable docs with `$update-doc` behavior when the task changes harness docs,
  repo conventions, architecture, or repeatable gotchas.

### 3. QA + Verification

Run a review loop until findings are zero, valid/actionable findings are zero,
or a clear blocker remains:

1. Run deterministic checks first: tests, typecheck, lint, build, harness check, and
   `git diff --check` when available.
2. For changed behavior or a user journey, replay every applicable observable checkpoint:
   immediately after the action, after each accepted/partial-success boundary, while work
   remains in progress, and after success, failure, and cancellation where applicable.
   Non-behavior edits may state that no observable checkpoints apply. Verify that removed
   or replaced state variables/components still have a replacement for every visible
   behavior they previously owned.
3. UI changes require live browser verification, not code inspection alone. In
   Codex, attempt Chrome Plugin verification first: load the Chrome control skill,
   connect to the user's Chrome extension backend, open/reload the changed route,
   and inspect the actual rendered screen with DOM or screenshot evidence. If the
   Chrome Plugin is unavailable after its documented retry/recovery steps, do not
   silently substitute another browser path; report the Chrome blocker and use an
   explicitly labeled fallback only when the user did not require Chrome.
4. Run at least **two independent QA/reviewer agents** over the diff and
   acceptance criteria in every QA round. This is a loop, not a one-time
   sign-off: after each fix round, rerun fresh QA/reviewer agents or explicitly
   continue both reviewers with the updated diff. Stop only when both reviewers
   return `0 findings`, or all remaining findings from both reviewers are
   documented as invalid/non-actionable with concrete reason.
   If two independent reviewer agents are unavailable, report that as a blocker;
   do not substitute self-review and do not call the work QA-clean.
5. For UI changes, run a visible-information duplication pass: inspect each row,
   card, modal, header, empty state, badge, and CTA for repeated semantic facts.
   Treat duplicate status/value/price/count/date/limit/benefit text in the same UI
   unit as a finding even when tests pass.
6. Review coding-convention adherence, not just correctness: read the project's
   `AGENTS.md`/`CLAUDE.md`/`docs/coding-rule.md` and matching neighbor files, and check
   the diff follows the documented architecture. For Bulletproof-style projects verify
   feature-slice layout, `api/`/`hooks/`/`utils/` ownership, colocated tests, and
   import-boundary rules (no cross-layer or app↔package violations). Treat layering,
   naming, and folder-ownership breaks as findings.
7. Treat missing tests as a finding: any changed testable logic (component handler/guard/
   conditional render, pure helper, mapper, behavior change, bug fix) without a covering
   component or unit test is a required-fix finding unless it falls under the explicit
   skip cases above.
8. Convert each issue into a finding with severity, file/line when possible, and a
   required fix.
9. Fix all actionable findings.
10. Any behavior-affecting edit after a QA pass invalidates that pass. Re-run deterministic
    verification, journey checkpoints, live UI verification when applicable, and both
    reviewers against the updated diff; do not carry forward an earlier sign-off.
11. Repeat until both reviewers return **0 findings** or **0 valid/actionable
    findings**.

If findings remain after three QA rounds, continue while progress is still clear.
If blocked, report the exact blocker, attempted fixes, invalidated findings with
reasons, and remaining valid findings.

### 4. Commit

Once QA returns **0 findings** or **0 valid/actionable findings**, and
verification is green, commit the work:

1. Stage only the files this task changed — never blanket-stage unrelated edits in a
   dirty tree. In the default task worktree this should be only task-owned files; if
   running without a worktree, stage your paths explicitly and leave pre-existing
   changes alone.
2. Write one or more Conventional Commits grouped by concern (`feat`/`fix`/`refactor`/
   `docs`/`test`/`chore`), with a clear subject and a body explaining the "why" when it
   is not obvious. Check `git log --oneline -10` to match the repo's commit style; for
   non-trivial splitting delegate to the `/commit` skill.
3. Commit on the task worktree branch. If worktree creation was skipped, commit on the
   current branch. Do not `push` unless the user explicitly asked.
4. Re-check `git status` after committing to confirm the intended files landed and
   nothing unexpected was staged.

Skip the commit only if the task made no file changes, the user said not to commit, or
committing is blocked — and say why.

## Agent Use

- Use agents for exploration, planning, implementation slices, and review whenever
  task size or risk justifies it.
- Keep the main thread as orchestrator: merge agent outputs, decide scope, apply final
  judgment, and verify.
- Do not leak hidden conclusions to reviewer agents; give them the diff, goal, and
  acceptance criteria.
- Prefer reviewer agents for final QA, not self-review alone.

## Output

Final response should include:

- what changed
- verification commands/results
- QA loop count, total final finding count, and valid/actionable final finding
  count (`0` when complete)
- final goal status (`complete`, `blocked`, or still active with why)
- commit(s) made (subject lines), or why no commit
- any residual risk or explicit blocker

## Safety

- For `/task`/`$task`, creating the task worktree branch is allowed only after
  the worktree safety gate passes. Do not create additional branches beyond that
  unless the user explicitly asks.
- Do not use destructive git commands, except expected-OID scoped `git update-ref -d refs/heads/<task-branch> <verified-task-head>`
  cleanup after successful squash-merge commit or after verified clean plan-only
  cleanup where task and base still point to the creation commit. Squash merges
  do not mark source
  branch merged by ancestry, so `git branch -d` may incorrectly refuse cleanup;
  only force-delete task branch after squash commit is present on recorded base
  and no worktree still uses that branch.
- Committing is allowed (stage 4) but gated: only after QA is clean, only the task's own
  files, never blanket-staging a dirty tree, and never `push` unless the user asked.
- Do not ignore user or harness constraints to reach "0 findings"; resolve the
  conflict or report a blocker.
