---
name: task
description: Run a delegated task loop: plan, execute, then QA/verify until findings are zero. Adds tests for testable code whenever the project has a test surface. Use when the user invokes /task or $task, asks for a structured task run, or wants an orchestrator to actively use agents/subagents for planning, implementation, and review. Commits the finished work as Conventional Commits once QA is clean.
user-invocable: true
argument-hint: "<task goal and constraints>"
allowed-tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Grep
  - Glob
  - Bash(git rev-parse*)
  - Bash(git status*)
  - Bash(git diff*)
  - Bash(git ls-files*)
  - Bash(git log*)
  - Bash(git add*)
  - Bash(git commit*)
  - Bash(ls*)
  - Bash(test*)
  - Bash(node*)
  - Bash(npm*)
  - Bash(bun*)
  - Bash(pnpm*)
  - Bash(yarn*)
  - Task
---

# Task

Act as the orchestrator above the work. Run the user's task through a three-stage
loop: plan, execute, then QA/verify. Use agents/subagents actively whenever they are
available and useful. Do not stop until QA findings are zero, the task is truly
blocked, or the user-defined budget/limit is reached.

## Input

Treat the `/task` or `$task` argument as the concrete goal. Preserve explicit
constraints, target paths, acceptance criteria, and "do not" instructions.

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
   dirty tree. If the tree holds pre-existing changes you did not author, stage your
   paths explicitly and leave the rest.
2. Write one or more Conventional Commits grouped by concern (`feat`/`fix`/`refactor`/
   `docs`/`test`/`chore`), with a clear subject and a body explaining the "why" when it
   is not obvious. Check `git log --oneline -10` to match the repo's commit style; for
   non-trivial splitting delegate to the `/commit` skill.
3. Commit on the current branch — do not create branches or switch branches. Do not
   `push` unless the user explicitly asked.
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
- commit(s) made (subject lines), or why no commit
- any residual risk or explicit blocker

## Safety

- Do not create branches unless the user explicitly asks.
- Do not use destructive git commands.
- Committing is allowed (stage 4) but gated: only after QA is clean, only the task's own
  files, never blanket-staging a dirty tree, and never `push` unless the user asked.
- Do not ignore user or harness constraints to reach "0 findings"; resolve the
  conflict or report a blocker.
