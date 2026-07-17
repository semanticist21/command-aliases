---
name: "task"
description: "Run repository-changing tasks and any plan that assumes repository changes—including Plan mode and plan-only requests—in an isolated prepared worktree through planning, implementation, QA, merge-back, and cleanup."
metadata:
  short-description: Plan, execute, QA until valid findings zero
---
# Task

Act as the orchestrator above the work. Run the user's task through a three-stage loop: plan, execute,
QA/verify. Use agents/subagents actively whenever available and useful. Do not stop until QA findings are
zero, valid/actionable findings are zero, or the task is truly blocked. A user-defined budget/limit may
pause only after owned queue items are fully landed, or after the exact blocker and remaining queue are
reported.

## Input

Treat the `/task` or `$task` argument as the concrete goal. Preserve explicit constraints, target paths,
acceptance criteria, and "do not" instructions.

### Inspect findings as input

`inspect` writes a read-only findings ledger to `<caller-root>/.agent-tmp/inspect-findings.md` and fixes
nothing. When the user points this task at it (`$task fix inspect F1, F3`), treat the ledger as the work
source:

- Read it from the caller root. Ignored `.agent-tmp/` does not exist in a fresh task worktree, and the
  caller root is the `original caller path` in `task-state.md` — not what `git rev-parse --show-toplevel`
  reports from inside the worktree.
- Act only on the findings the user selected. `inspect` lists; the user chooses.
- Scope each selected finding (where/impact/remediation) as one concrete goal through the loop below.
  Independent findings may become separate queue items or commits.
- After the work merges back and the worktree is cleaned up, mark each landed finding
  `status: resolved (<commit>)` in the caller-root ledger; leave unselected or blocked findings `open`
  with the reason. Never stage or commit the ledger.

## Plan-only requests

When the user asks for a plan without implementation, create the goal and a prepared task worktree before
implementation-file inspection or detailed planning. Run only the Planning stage: do not execute, run
implementation QA, or commit. Once the plan is ready but before delivering it, run the cleanup helper from
the caller worktree:

```bash
node ~/.codex/skills/task/scripts/task-worktree-plan-cleanup.mjs --repo "<caller-root>" --worktree "<task-worktree>" --branch <task-branch> --head <creation-commit>
```

The helper is state-bound, not mode-bound: it cleans up only when the worktree is still at exactly the
`--head` commit, is byte-clean, and its ignored artifacts still match the setup baseline recorded at
creation — nothing about the request being plan-only enters into it. It validates that state itself across
recursive submodules and refuses anything else. Never discard changes to force cleanup — report the exact
unexpected state instead. Mark the planning goal complete only after clean worktree and branch cleanup,
then deliver the plan.

## Changed-surface verification

After merging the recorded local base into the task worktree, use the bundled verifier as the final
deterministic gate and the source of verification evidence:

```bash
cd <task-worktree> && node ~/.codex/skills/task/scripts/task-verify.mjs --base <recorded-base>
```

It discovers changed JavaScript packages and Rust crates and runs each available package-level test, lint,
typecheck/check, and build command once, writing a receipt to the ignored `.agent-tmp/task-verification.json`.
Rust crates with soft-skipping DB integration tests require `DATABASE_URL`: a detected
`skip: no local postgres`-style line fails the verifier even when the test process exits zero.

`--dry-run` only prints the command plan and never satisfies merge verification. Project-owned canonical
verification commands still win where they cover more stacks or services — run those in addition. A
pre-existing or out-of-scope red gate explains a failure but never turns it green: fix it within scope or
report the task blocked.

## Start Gate

Before starting new work, clear or queue only task work **owned by this agent/session**.

**Ownership evidence** is one of: an active goal/session naming or matching the discovered task
worktree/branch/path; an owner/session marker in its `task-state.md` matching this run; or an explicit
handoff/user instruction naming that work as yours. A task worktree without that evidence belongs to
another agent — treat it as context, never as stale local work to clean up.

1. Check for an active `task`/`microtask` goal and inspect the repo with `git status --short`,
   `git status --porcelain=v1 -b`, `git worktree list`, and `git branch --list 'task/*'`.
2. Use `<project-root>/.agent-tmp/task-queue.md` as the default queue log; ensure `.agent-tmp/` is ignored
   before writing. If the project root is unavailable or a safe queue write is blocked, keep the request in
   conversation only and say it was not persisted.
3. Owned work **complete but uncleaned** (leftover worktree, branch, or unmerged commit): finish merge-back
   only when the base is known from its `task-state.md`, a goal/session handoff, or explicit user
   instruction, then clean up before planning new work. Never guess `main` for your own leftover task —
   stop and ask.
4. Owned work **still in progress**: queue the new request rather than starting it, unless the user
   explicitly says to proceed from committed `HEAD`. In that override case, leave the existing worktree and
   branch untouched as read-only external state and start the new task from current `HEAD`. Never ask
   whether to resume later, stop with queued-only status, or wait for another prompt — drain per **Queue
   Drain**.
5. Cleanup/landing is not blocked by an ordinary task-related merge conflict: resolve it from the task
   intent, rerun the required verification, and continue. Stop only for an unfinished git operation, an
   unknown base, ambiguous ownership that would overwrite user work, or a genuinely incompatible conflict
   whose correct product outcome cannot be determined from the task and repository evidence.

## Worktree Isolation

For repo-writing tasks and repository-changing implementation plans — including Plan mode and plan-only
requests — bootstrap a prepared worktree **before** implementation-file inspection or detailed planning:

```bash
node ~/.codex/skills/task/scripts/task-worktree-create.mjs <slug> --id <unique-id> --repo <repo-root> --summary "<task summary>"
```

Generate one lowercase filesystem-safe unique ID per invocation, preferably from the platform session plus
current UTC timestamp. On a reported ID collision, generate a new ID; never reuse or take over the existing
worktree. The script creates the worktree from current `HEAD` on `task/<slug>-<unique-id>` (keep the slug
short, lowercase, filesystem-safe), records task state, initializes recursive submodules, and installs
dependencies from recognized tracked lockfiles across the superproject and every initialized submodule with
repository lifecycle/build scripts disabled. It then runs the optional command each repository root declares
in tracked `.agents/task-worktree.json` (`{"prepare":{"command":"make","args":["gen"]}}`) and rejects
repository HEAD/branch changes plus any tracked or unignored preparation changes.

For a plan-only request, append `--plan-only`. It is recorded in task state and is part of the creator's
identity check, so a re-run against the same worktree must pass it identically.

If setup fails *after* the worktree exists, keep that worktree and repair setup inside it — never create a
second worktree and never fall back to the caller checkout. A raw
`git worktree add -b task/<slug>-<unique-id> ../<repo>-task-<slug>-<unique-id> HEAD` is the documented
recovery path only when the script is unavailable or fails before creating a worktree.

**Caller-tree dirty files almost never block.** If committed `HEAD` exists and a worktree can be created
from it, do it without asking — regardless of caller dirty files, staged files, unmerged paths,
merge/rebase/cherry-pick/bisect state, or unrelated task branches. Branch from the last commit, include the
caller's `git status --short` and `git status --porcelain=v1 -b` in agent briefs, and treat the caller tree
as read-only context; never move, stash, reset, or otherwise alter its pre-existing dirty files. Ask only
when the user explicitly says the task must incorporate uncommitted tracked or untracked changes, or
explicitly asks to work in the current tree. If even this rare path fails (no `HEAD`, path/branch collision,
transient git lock), report the waiting state, check periodically, and retry until it clears or the user
redirects; do not mark blocked immediately.

Skip the worktree when the user explicitly asks you to, the repo is not a git repo, the task is
read-only/no-file-change, or `git worktree add` fails — report the reason and protect unrelated
caller-checkout changes if work continues there. Operational/exploratory work that should not create a
commit or leave `git log` history does not need one either. Whenever you work in the caller checkout, state
that decision, preserve unrelated changes, and stage only explicit task paths.

Before creating the worktree:

1. Resolve the repository that owns the files to be written, then its root with
   `git rev-parse --show-toplevel`. Explicit target paths and named skill sources override the caller
   repository; for cross-repository work, run the creator against that target repository.
2. Record the caller's current branch with `git branch --show-current` — the base branch the work must merge
   back into. If detached, resolve the intended base from the user's prompt or stop and ask.
3. Confirm the sibling worktree path and `task/<slug>-<unique-id>` branch name are unused.

Immediately after creation, record task state in `<task-worktree>/.agent-tmp/task-state.md`: base branch,
task branch, worktree path, original caller path, created time, task summary, and owner/session marker. With
no platform session id, derive a stable marker from runtime name + created timestamp + caller path + concise
task summary. Keep `.agent-tmp/` ignored and never stage it.

Run planning, edits, tests, QA, and the task-branch commit inside the task worktree. Treat the original
working tree as read-only task context unless the user explicitly asks to apply changes there. In Codex
unified exec, set the tool workdir or prefix shell commands with `cd <task-worktree> &&` so the active
checkout stays explicit.

## Finalize: land through a CI PR or local squash, then clean up

After QA passes and the task branch is committed, own landing through the recorded base (`main`, `dev`, or
the branch the caller started from). Never finish with an open PR, unresolved conflict, pending checks, or
completed work that is absent from its target base.

**Select the landing lane.** A repository has a CI environment when tracked CI configuration exists
(`.github/workflows/*.yml` or `.yaml`, `.gitlab-ci.yml`, `Jenkinsfile`, or an equivalent project-declared
CI configuration). A CI-enabled repository must use its host's review-request lane (a **PR** on GitHub);
use the **local-squash lane** only when no CI configuration exists. Do not downgrade to local squash because
authentication, PR creation, a check, review, or a merge conflict is temporarily failing: repair and retry
the PR lane. If a required external permission or service remains unavailable after sensible retries, report
that exact external blocker and keep the goal active.

**1. Reconcile the latest base before either lane.** From the task worktree, fetch the recorded base from
its tracking remote (for example, `git fetch origin <recorded-base>`) and merge that fetched tip with
`git merge --no-edit FETCH_HEAD`; never assume the local `<recorded-base>` ref is current. Resolve
task-related conflicts yourself using the task acceptance criteria, existing tests, and the current base
behavior; do not discard either side blindly. Rerun the full test, lint, typecheck, and build gates after
every resolution. If the base moves again before landing, repeat this reconciliation and verification loop.

**2. CI review-request lane: create, shepherd, and merge it.** Push the task branch, create or update the
review request targeting the recorded base, and include the QA evidence. Monitor its mergeability and
required checks with the host CLI (for GitHub, `gh pr checks --watch` and `gh pr view --json
state,mergeStateStatus,mergeable,mergeCommit`; for GitLab, use `glab mr create`, `glab ci status --live`,
and `glab mr merge` with equivalent merged-result commit verification). Diagnose and fix failures caused by the task, commit and push the repair,
and repeat until all required checks pass. When the base advances or the review request reports conflicts,
repeat step 1, resolve the conflicts, rerun verification, and push again. Once requirements are satisfied,
re-fetch the base immediately before requesting the merge, and merge through the review request using the
repository's permitted method (including a GitHub squash merge when that is the configured PR method). Verify
after the host-side merge, fetch the recorded base again and prove the resulting review-request commit OID
(the PR's `mergeCommit` on GitHub) is an ancestor of that fetched `FETCH_HEAD` (for example,
`git merge-base --is-ancestor <result-oid> FETCH_HEAD`). Obtain an approval only when the platform requires
an independent human approval that the agent is not authorized to provide; otherwise do not leave the task
waiting for a human to press merge.

**3. Local-squash lane: journal and land from the base checkout.** Run this only when the landing selection
selected the local-squash lane. Re-check that the base checkout is clean, fetch the recorded base from its
tracking remote, and record `latest_base=$(git rev-parse FETCH_HEAD)`. If that tip differs from the base tip
last reconciled in the task worktree, merge `latest_base` into the task worktree, resolve conflicts, and
rerun verification; then fetch again in the caller checkout and repeat this comparison. Only when the exact
`latest_base` is a verified ancestor of the task head may the caller fast-forward with
`git merge --ff-only "$latest_base"` before the helper records its marker. Its proven interrupted-landing
recovery uses a scoped `git reset --hard <marker>`. Capture the reconciled task tip, derive the creation slug
from the recorded task branch, then run the finalizer from the caller root. The task worktree cannot switch
to the base branch — the base checkout already holds it — and the helper addresses the caller root explicitly:

```bash
task_head=$(git -C <task-worktree> rev-parse HEAD)
task_slug=${task_branch#task/}
node ~/.codex/skills/task/scripts/task-finalize.mjs \
  --repo <caller-root> --base <base> --branch <task-branch> \
  --worktree <task-worktree> --slug "$task_slug" --head "$task_head"
```

- **The helper is the landing journal and recovery boundary.** Before it touches the index, it writes the
  current base tip to `task-landing-<slug>` under Git's common directory. Its squash commit appends
  `Task-Head: <task_head>` and commits only paths calculated from `<base>..<task_head>`; never replace it
  with a bare `git commit`. Re-running with the same recorded head finds that trailer, avoids a duplicate
  squash, and converges cleanup.
- **Only the proven interrupted state may reset.** With no journal trailer, the helper hard-resets the
  marker only when the base still equals the recorded tip, `SQUASH_MSG` exists, the task branch still names
  `task_head`, and both index and worktree exactly match that task head. Any other marker or squash state
  is unknown: leave it untouched and report it.
- **The worktree removal precedes the branch delete.** Both have existence guards for repeat runs.
  `git branch -D` still refuses when another worktree holds the branch; never replace it with plumbing ref
  deletion. `-D` is required because squash leaves no ancestry link for `-d` to recognize.

**4. Tear down and prove completion.** Tear down only external resources this worktree created, using the
project's scoped reaper and process PIDs. Confirm the review request is merged or the local squash is on the
recorded base, then remove the task worktree and branch. Do not mark the task complete until that cleanup succeeds.
Sibling task worktrees/branches owned by other agents never block completion.

Unrelated dirty files inside an agent-owned task worktree are not a reason to leave task garbage: inspect
them, classify ownership, and carry owned work through landing. Never stash, reset, checkout over, or
overwrite external/user-owned changes. Push is required for the CI review-request lane and otherwise happens
only when
the user asks.

## Goal Tracking

Use the platform goal mechanism for every task run. Create the goal from the concrete objective, not the raw
argument when it carries paths, constraints, or "do not" clauses — preserve those in the task context and
acceptance criteria. Call `get_goal` before planning; if no goal is active, call `create_goal`. If the
active goal matches this task, reuse it. If an unrelated goal is active, report the conflict and do not call
`create_goal`. Report progress in normal task updates, not goal status commands, unless the platform
explicitly supports non-terminal progress states.

Use `update_goal` only for terminal states, `complete` or `blocked`. Mark `complete` only after QA is clean
or valid/actionable findings are zero **and** commit, merge-back/cleanup, and owned queue drain are all
done; if a required lifecycle step is blocked, report the blocker and keep the goal active. Never mark
blocked work, budget exhaustion, or partial progress `complete`. Mark `blocked` only when the same blocker
has repeated across the required goal turns and no meaningful progress is possible without user input or
external state change — a dirty caller tree is not such a blocker.

## Queue Drain

Queued task or microtask requests are already user-approved work. Once an item is recorded in
`<project-root>/.agent-tmp/task-queue.md`, do not ask whether to run it, do not stop with queued-only
status, and do not wait to be prompted again. Record each owned item with its target base branch: inherit
the active parent task's recorded base when one exists, otherwise `main` unless the user names another.
Never leave an owned item with an implicit or unknown base.

You own an item once you write it, accept explicit user queued work, or acknowledge it as yours during
task/microtask work — until it is **fully landed** or you report a real blocker. Fully landed means QA
passed, work committed, merged through its CI review request or local-squashed into its recorded base, and the task
worktree/branch cleaned up; for a
queued `microtask`, committed into the active parent task worktree or its target base, with the parent
itself merged back and cleaned up. Never call a task "done" while an owned item remains only in the queue
file, a side worktree, or an unmerged branch. Never drain entries owned by another agent/session or project
root; leave them untouched.

At every finalization checkpoint and before the final response:

1. Re-open the queue file. Take the oldest item eligible for the current lifecycle stage, mark it
   in-progress or remove it from pending so it cannot run twice, and execute it by its declared mode.
2. While an active parent task is unmerged, drain every eligible `microtask` item for that parent **before**
   parent merge-back, scanning past queued `task` items to find them. Run queued `task` items only after the
   parent is committed, merged back, and cleaned up, then start each from its recorded base. With no active
   parent, finish the current commit and cleanup first.
3. Mark the item completed with landed commit/base details, then repeat from step 1.
4. Send the final response only when the queue is empty or a real blocker prevents meaningful progress —
   then report that exact blocker and the remaining queued items.

## Agent Briefing

Use agents for exploration, planning, implementation slices, and review whenever task size or risk justifies
it. Keep the main thread as orchestrator: merge agent outputs, decide scope, apply final judgment, verify.

Every delegated agent must receive the real task context, not a vague summary: the original user goal and
exact constraints; relevant repo instructions, target paths, ownership boundaries, and current git status;
its assigned scope and what is explicitly out of scope; acceptance criteria, verification commands, and
expected output format; and any files it must read first.

For small one-shot calls, put that brief in the agent prompt. For multi-agent, long-running, or high-context
work, write a project-local handoff doc and tell every agent to read it before acting:

1. Resolve the project root with `git rev-parse --show-toplevel` when possible and use
   `<project-root>/.agent-tmp/` as the shared temporary task directory, creating it if needed.
2. Ensure `.agent-tmp/` is ignored at the project root; if no existing rule covers it, add the line
   `.agent-tmp/` to `<project-root>/.gitignore`, creating `.gitignore` if needed. Never stage or commit
   files under `.agent-tmp/`.
3. Write a concise brief such as `<project-root>/.agent-tmp/task-brief.md` or
   `<project-root>/.agent-tmp/<task-slug>.md`: goal, constraints, scope, commands, factual context. Keep it
   neutral and update it when scope or acceptance criteria change.
4. Keep implementation notes or hypotheses separate when they could bias a reviewer.

Agent prompts must point at the brief path and restate that agent's slice in the prompt itself. Give
reviewer agents the goal, acceptance criteria, and diff directly; never ask them to read biased
implementation notes, leak hidden conclusions, or coach them toward a desired verdict. Prefer reviewer
agents for final QA, never self-review alone.

## Loop

### 1. Planning

- Read the nearest `AGENTS.md`/`CLAUDE.md` and relevant harness docs; inspect the repo shape and git status.
- For tasks that create or modify code, load the `coding-rule` skill before planning and put its
  minimal-code, no speculative extraction/export, and project-version convention rules in the acceptance
  criteria.
- For tasks that create or modify UI screens, load the `design` skill before planning and put its
  non-duplication, minimalism, and conventional UX rules in the acceptance criteria — including the
  duplication and spatial-hierarchy checks that QA step 5 will enforce.
- If subagents are available, delegate exploration/planning for non-trivial tasks — an investigator to
  locate relevant files, owners, conventions, and risk areas; a planner to propose steps and acceptance
  checks.
- Make tests part of the acceptance criteria by default: name which component and unit tests the change will
  add or extend, or explicitly justify why none apply.
- Produce a short plan with acceptance criteria and verification commands.

### 2. Execute

- Implement the plan in small, reviewable changes, preferring existing patterns and narrow edits. Delegate
  isolated edits or parallel file discovery to agents when it saves context or reduces risk.
- **Always write tests for what you changed — maximize coverage of the changed surface, not the bare
  minimum.** Whenever the project has a test surface, add by default:
  - **Component tests** for UI-logic changes in `.tsx`/component files: event handlers, guard conditions,
    conditional rendering, presence/absence of buttons and states. These logic bugs are invisible to
    util-only tests; cover them with the project's component-test harness (e.g. `*.test.tsx` with
    `@testing-library/react`).
  - **Unit tests** for pure functions, mappers, validators, parsers, serializers, view models, and any
    behavior change.
  - For a bug, a regression test that fails before the fix and passes after.

  Mirror the project's test framework, layout, and conventions — check `package.json`/`Cargo.toml`/test dirs
  and neighbor test files to confirm what harness is enabled. Skip a test only for purely visual/style/copy
  edits with no logic, trivial typos, or projects with no test setup, and say explicitly why.
- For stateful or sequenced behavior, write the observable transition path before testing (for example:
  idle → accepted → in progress → success/failure/canceled). Cover each user-visible state and every
  observable boundary between consecutive operations, including the state after operation A succeeds but
  before operation B finishes; explicitly justify any boundary that is unobservable or inapplicable. An
  all-immediate mock does not prove intermediate behavior — use controllable promises, clocks, deferred
  responses, or an equivalent harness to hold and assert non-terminal states.
- Update durable docs with `$update-doc` behavior when the task changes harness docs, repo conventions,
  architecture, or repeatable gotchas.

### 3. QA + Verification

Run a review loop until findings are zero, valid/actionable findings are zero, or a clear blocker remains:

1. Run deterministic checks first: tests, typecheck, lint, build, harness check, and `git diff --check` when
   available.
2. For changed behavior or a user journey, replay every applicable observable checkpoint: immediately after
   the action, after each accepted/partial-success boundary, while work remains in progress, and after
   success, failure, and cancellation where applicable. Non-behavior edits may state that no observable
   checkpoints apply. Verify that removed or replaced state variables/components still have a replacement
   for every visible behavior they previously owned.
3. UI changes require live browser verification, not code inspection alone. Attempt Chrome Plugin
   verification first: load the Chrome control skill, connect to the user's Chrome extension backend, open
   or reload the changed route, and inspect the actual rendered screen with DOM or screenshot evidence. If
   the Chrome Plugin is unavailable after its documented retry/recovery steps, do not silently substitute
   another browser path: report the Chrome blocker and use an explicitly labeled fallback only when the user
   did not require Chrome.
4. Run at least **two independent QA/reviewer agents** over the diff and acceptance criteria in every QA
   round. This is a loop, not a one-time sign-off: after each fix round, rerun fresh reviewer agents or
   explicitly continue both with the updated diff. Stop only when both return `0 findings`, or every
   remaining finding from both is documented as invalid/non-actionable with a concrete reason. If two
   independent reviewers are unavailable, report that as a blocker; never substitute self-review or call the
   work QA-clean.
5. For UI changes, run a visible-information duplication pass: inspect each row, card, modal, header, empty
   state, badge, and CTA for repeated semantic facts. Duplicate status/value/price/count/date/limit/benefit
   text in the same UI unit (the same status in both helper text and a badge, say) is a finding even when
   tests pass. Check row/card spatial hierarchy in the same pass: primary content leads, secondary details
   support it, status/actions take trailing or distinct slots.
6. Review coding-convention adherence, not just correctness: read the project's
   `AGENTS.md`/`CLAUDE.md`/`docs/coding-rule.md` and matching neighbor files, and check the diff follows the
   documented architecture. For Bulletproof-style projects verify feature-slice layout,
   `api/`/`hooks/`/`utils/` ownership, colocated tests, and import-boundary rules (no cross-layer or
   app↔package violations). Layering, naming, and folder-ownership breaks are findings.
7. Treat missing tests as a finding: any changed testable logic (component handler/guard/conditional render,
   pure helper, mapper, behavior change, bug fix) without a covering component or unit test is a
   required-fix finding unless it falls under the explicit skip cases above.
8. Convert each issue into a finding with severity, file/line when possible, and a required fix, then fix
   all actionable findings.
9. Any behavior-affecting edit after a QA pass invalidates that pass. Re-run deterministic verification,
   journey checkpoints, live UI verification when applicable, and both reviewers against the updated diff;
   never carry forward an earlier sign-off.
10. Repeat until both reviewers return **0 findings** or **0 valid/actionable findings**.

If findings remain after three QA rounds, continue while progress is still clear. If blocked, report the
exact blocker, attempted fixes, invalidated findings with reasons, and remaining valid findings.

### 4. Commit

Once QA returns **0 findings** or **0 valid/actionable findings** and verification is green:

1. Stage only the files this task changed — never blanket-stage unrelated edits in a dirty tree. In the
   default task worktree that should be only task-owned files; without a worktree, stage your paths
   explicitly and leave pre-existing changes alone.
2. Write one or more Conventional Commits grouped by concern
   (`feat`/`fix`/`refactor`/`docs`/`test`/`chore`), with a clear subject and a body explaining the "why"
   when it is not obvious. Check `git log --oneline -10` to match the repo's commit style; for non-trivial
   splitting delegate to the `/commit` skill.
3. Commit on the task worktree branch, or the current branch if worktree creation was skipped. Push when the
   CI review-request landing lane requires it; otherwise do not push unless the user explicitly asked.
4. Re-check `git status` after committing to confirm the intended files landed and nothing unexpected was
   staged.

Skip the commit only if the task made no file changes, the user said not to commit, or committing is
blocked — and say why.

## Output

Final response should include:

- what changed
- verification commands/results
- QA loop count, total final finding count, and valid/actionable final finding count (`0` when complete)
- final goal status (`complete`, `blocked`, or still active with why)
- commit(s) made (subject lines), or why no commit
- any residual risk or explicit blocker

## Safety

- For `/task`/`$task`, creating the task worktree branch is allowed only after the worktree safety gate
  passes. Do not create additional branches beyond that unless the user explicitly asks.
- Do not use destructive git commands. The only exceptions are the finalizer's `git reset --hard <marker>`
  after every documented proof check passes, and deleting the task branch with `git branch -D` after its
  journaled squash commit exists and no worktree still uses it.
- Committing is allowed (stage 4) but gated: only after QA is clean and only for the task's own files. Push
  only for the CI review-request landing lane or when the user explicitly asks.
- Do not ignore user or harness constraints to reach "0 findings"; resolve the conflict or report a blocker.
