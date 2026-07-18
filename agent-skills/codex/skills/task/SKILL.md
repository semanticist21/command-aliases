---
name: "task"
description: "Run repository-changing tasks and implementation plans in an isolated worktree through planning, QA, landing, and cleanup."
---
# Task

Treat `/task` or `$task` argument as concrete goal. Preserve user scope, acceptance criteria,
and prohibitions. Own work until it lands, is cleanly removed, or is genuinely blocked.

## Start

1. Read nearest `AGENTS.md`, project instructions, git status/branch/worktrees, and active goal.
   Never alter unowned worktrees, branches, queues, or caller-tree changes.
2. Reuse matching active goal. An unrelated active goal is a conflict; do not replace it. In
   Codex, create a goal before detailed planning and use `update_goal` only for terminal states.
3. Inspect `<root>/.agent-tmp/task-queue.md` when available. Queue new owned work behind active
   work; drain eligible owned items oldest first. Never report done with owned queued or unmerged work.
4. Resolve target repo and caller base branch. Caller dirty state normally does not block: preserve it
   read-only and branch from committed `HEAD`. Ask only when user requires uncommitted changes.
5. For `inspect` findings, read caller-root `.agent-tmp/inspect-findings.md`, act only on findings user
   selected, mark landed findings resolved after cleanup, and never stage that ledger.

## Worktree

For any repo write or implementation plan, create one prepared worktree before detailed file inspection:

```bash
node ~/.codex/skills/task/scripts/task-worktree-create.mjs <slug> \
  --id <unique-id> --repo <repo-root> --summary "<task summary>"
```

- Use unique lowercase safe slug/ID. Record base, branch, path, caller, owner marker, and summary in
  `.agent-tmp/task-state.md`; keep it ignored. Run all planning, edits, tests, and commit there.
- Do not create a second worktree after setup failure; repair retained one. Do not work in caller tree
  unless user explicitly requests it, repo is not git, or worktree setup cannot run; state reason.
- For plan-only add `--plan-only`; do not implement or commit. Before response, clean only with
  `task-worktree-plan-cleanup.mjs` after its state checks pass. Never discard changes to force cleanup.
- If a prior owned task is complete but uncleaned, land only with known recorded base, then clean it.
  Unknown ownership/base, unfinished git operation, or ambiguous overlap is a blocker.

## Plan and execute

1. State concise plan: acceptance criteria, affected paths, risks, verification, and independent work.
2. Read applicable nested docs and nearby code before edits. Keep scope minimal; preserve existing user
   changes and project conventions. Load named/relevant skills before using their workflows.
3. Use subagents when useful for independent investigation, implementation, or QA. Brief them with
   verbatim user goal, constraints, target paths, base/worktree, and expected evidence; main agent owns
   judgment, integration, verification, and landing.
4. Track meaningful queue items in `.agent-tmp/task-queue.md` with owner, base, status, and landed commit.
   Do not queue work owned by another session.

## Verify and QA

1. Run focused tests plus relevant project test/lint/typecheck/build commands. Changed behavior needs
   regression coverage unless genuinely untestable; explain any exception. UI work needs live browser
   verification or screenshot/render evidence; code inspection alone is insufficient.
2. Before landing, merge latest recorded base into worktree, resolve task-related conflicts, and rerun
   affected verification. Use this final deterministic gate:

```bash
node ~/.codex/skills/task/scripts/task-verify.mjs --base <recorded-base>
```

   Treat unsupported-package/no-command output as documented N/A, not a green substitute for project gates.
   Database soft-skips and any relevant red gate fail verification.
3. Every QA round needs two independent reviewer agents against verbatim user request and current diff.
   They must provide requirement evidence and severity-tagged findings. Fix actionable findings, then rerun
   verification and fresh review after behavior changes. Do not call self-review QA-clean; unavailable
   reviewers are a blocker. Continue while progress exists; report exact unresolved blocker otherwise.
4. Review correctness, security, tests, docs, project architecture, and UI information duplication.
   Findings need severity, location, impact, and required fix. Stop only at zero findings or zero valid
   actionable findings with concrete reasons for invalid findings.

## Commit and land

1. Stage explicit changed paths only. Commit after QA is clean using Conventional Commit style matching
   recent history; inspect status afterward. Never blanket-stage caller-tree changes.
2. Fetch recorded base and merge it into task worktree before landing. Re-verify after resolution.
3. If tracked CI exists, push branch, create/update PR, watch required checks for current head, repair
   task-caused failures, merge only after passing checks, then prove merge commit is ancestor of fetched base.
   Obtain human approval only when platform requires it.
4. Without CI, run this from caller base checkout; it journals and squashes task paths. Never replace it
   with manual reset/commit. Then confirm landed commit on recorded base:

```bash
node ~/.codex/skills/task/scripts/task-finalize.mjs --repo <caller-root> --base <base> \
  --branch <task-branch> --worktree <task-worktree> --slug <slug> --head <task-head>
```
5. Remove task worktree and branch only after landing. Do not mark complete before cleanup succeeds.

## Output

Final response: changed work; verification evidence; QA rounds and final/valid finding counts; goal status;
commit(s); residual risk/blocker. End with one concise Korean summary sentence.

## Safety

- Never stash, reset, overwrite, delete, or move user work. Only documented task finalizer recovery may
  use its scoped reset after every proof check.
- Do not weaken user or repository constraints to claim completion. A budget pause reports landed work,
  exact blocker, and remaining owned queue.
- Do not claim external checks, merges, or UI verification without direct evidence.
