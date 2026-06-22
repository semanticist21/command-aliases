---
name: "task"
description: "Run a delegated task loop through plan, implementation, QA, and commit. Use for /task or structured agent-driven work."
user-invocable: true
argument-hint: "<task goal and constraints>"
metadata:
  short-description: Plan, execute, and QA until findings are zero
---
# Task

Act as the orchestrator above the work. Run the user's task through a three-stage
loop: plan, execute, then QA/verify. Use agents/subagents actively whenever they are
available and useful. Do not stop until QA findings are zero, the task is truly
blocked, or the user-defined budget/limit is reached.

## Input

Treat the `/task` or `$task` argument as the concrete goal. Preserve explicit
constraints, target paths, acceptance criteria, and "do not" instructions.

## Worktree Isolation

Use a dedicated git worktree by default for every task that will read/write repo
files, so the task does not disturb the caller's current working tree.

1. Resolve the project root with `git rev-parse --show-toplevel`.
2. Inspect `git status --short` before creating the worktree and include that status
   in agent briefs. Do not move, stash, reset, or otherwise alter pre-existing dirty
   files in the caller's working tree.
3. Create a sibling worktree from the current `HEAD`, using a task branch:
   `git worktree add -b task/<slug>-<timestamp> ../<repo>-task-<slug>-<timestamp> HEAD`.
   Keep the slug short, lowercase, and filesystem-safe.
4. Run planning, edits, tests, QA, and commit inside the task worktree. Treat the
   original working tree as read-only task context unless the user explicitly asks to
   apply changes there.
5. If the task explicitly depends on uncommitted caller changes, stop and ask whether
   to include those changes, because the default worktree starts from committed
   `HEAD`.
6. Skip worktree creation only when the user asks not to, the repo is not a git repo,
   the task is read-only/no-file-change, or `git worktree add` fails. State the reason
   and continue in the current tree only when it is safe.
7. After the task is complete or blocked, leave the worktree in place and report its
   path and branch. Do not remove it unless the user asks.

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
  Mark `complete` only after QA is clean and the commit step is either done or
  explicitly skipped for a valid reason.
- Mark `blocked` only when the same blocker has repeated across the required goal
  turns and no meaningful progress is possible without user input or external state
  change. Do not mark budget exhaustion or partial progress as complete.

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
- If subagents are available, delegate exploration/planning for non-trivial tasks:
  - investigator: locate relevant files, owners, conventions, risk areas.
  - planner: propose steps and acceptance checks.
- Produce a short plan with acceptance criteria and verification commands.

### 2. Execute

- Implement the plan in small, reviewable changes.
- Prefer existing patterns and narrow edits.
- **After writing the code, add tests when the project has a test surface and the work
  is testable** — pure functions, mappers, validators, parsers, serializers, behavior
  changes. Mirror the project's test framework, layout, and conventions (check
  `package.json`/`Cargo.toml`/test dirs to confirm tests are enabled). For a bug, add a
  regression test that fails before the fix and passes after. Skip only for markup/
  visual-only edits, trivial typos, or projects with no test setup — and say why.
- Delegate isolated edits or parallel file discovery to agents when it saves context
  or reduces risk.
- Update durable docs with `$update-doc` behavior when the task changes harness docs,
  repo conventions, architecture, or repeatable gotchas.

### 3. QA + Verification

Run a review loop until findings are zero:

1. Run deterministic checks first: tests, typecheck, lint, build, harness check, and
   `git diff --check` when available.
2. Run an independent QA/reviewer agent pass over the diff and acceptance criteria.
3. Review coding-convention adherence, not just correctness: read the project's
   `AGENTS.md`/`CLAUDE.md`/`docs/coding-rule.md` and matching neighbor files, and check
   the diff follows the documented architecture. For Bulletproof-style projects verify
   feature-slice layout, `api/`/`hooks/`/`utils/` ownership, colocated tests, and
   import-boundary rules (no cross-layer or app↔package violations). Treat layering,
   naming, and folder-ownership breaks as findings.
4. Convert each issue into a finding with severity, file/line when possible, and a
   required fix.
5. Fix all actionable findings.
6. Re-run verification and reviewer pass.
7. Repeat until the reviewer returns **0 findings**.

If findings remain after three QA rounds, continue only when progress is still clear.
If blocked, report the exact blocker, attempted fixes, and remaining findings.

### 4. Commit

Once QA returns **0 findings** and verification is green, commit the work:

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
- QA loop count and final finding count (`0` when complete)
- final goal status (`complete`, `blocked`, or still active with why)
- commit(s) made (subject lines), or why no commit
- any residual risk or explicit blocker

## Safety

- For `/task`/`$task`, creating the task worktree branch is allowed and expected by
  default. Do not create additional branches beyond that unless the user explicitly
  asks.
- Do not use destructive git commands.
- Committing is allowed (stage 4) but gated: only after QA is clean, only the task's own
  files, never blanket-staging a dirty tree, and never `push` unless the user asked.
- Do not ignore user or harness constraints to reach "0 findings"; resolve the
  conflict or report a blocker.
