---
name: "microtask"
description: "Run /microtask directly on the base branch, no worktree."
user-invocable: true
argument-hint: "<small task goal constraints>"
metadata:
  short-description: Direct-branch plan, execute, QA
---

# Microtask

Run a bounded task through the same disciplined loop as `task`: plan, execute,
verify, review, and commit when appropriate. Use skills and agents/subagents
actively whenever they help. The difference is intentional:
**do the work directly in the caller's current base-branch worktree. Do not create
a task worktree or task branch.**

## Input

Treat `/microtask` or `$microtask` argument as the concrete goal. Preserve explicit
constraints, target paths, acceptance criteria, and "do not" instructions.

## Direct Branch Work

For repo-writing work, current-branch work is the default contract.

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
- Mark `complete` only after verification, review, and the intended commit step
  are done or explicitly skipped for a valid reason.
- Mark `blocked` only when the same blocker has repeated across required goal
  turns and no meaningful progress is possible without user input or an external
  state change. Do not mark budget exhaustion or partial progress as complete.

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

Run the loop until findings are zero or a clear blocker remains.

1. Run deterministic checks first: relevant tests, typecheck, lint, build, harness
   checks, and `git diff --check` where available.
2. UI changes require live browser verification, not code inspection alone. In
   Codex, attempt Chrome Plugin verification first: load Chrome control skill,
   connect the user's Chrome extension backend, open or reload the changed route,
   and inspect actual rendered screen DOM or screenshot evidence. If Chrome
   Plugin is unavailable after its documented retry/recovery steps, do not
   silently substitute another browser path; report the Chrome blocker and use an
   explicitly labeled fallback only when the user did not require Chrome.
3. Run an independent QA/reviewer agent pass over the diff and acceptance
   criteria.
4. For UI changes, check visible information duplication in rows, cards, modals,
   headers, empty states, badges, and CTAs.
5. Review coding-convention adherence against nearby docs and files.
6. Convert issues into severity-tagged findings with file/line where possible.
7. Fix actionable findings and re-run verification.
8. Repeat until the reviewer returns **0 findings**.
9. If findings remain after three QA rounds, continue only when progress is still
   clear. If blocked, report the exact blocker, attempted fixes, and remaining
   findings.

### 4. Commit

Once QA returns **0 findings** and verification is green:

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
- QA loop count and final finding count (`0` when complete)
- final goal status (`complete`, `blocked`, or still active with why)
- commit subject(s), or why no commit was made
- any residual risk or explicit blocker

## Safety

- `microtask` means no worktree and no task branch by default.
- Do not use destructive git commands.
- Do not move, stash, reset, or overwrite user changes.
- Do not push unless explicitly asked.
- Do not ignore user or harness constraints to claim "0 findings".
