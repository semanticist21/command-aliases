---
name: "task"
description: "Run repository-changing tasks and implementation plans in an isolated worktree through planning, QA, landing, and cleanup."
user-invocable: true
argument-hint: "<task goal and constraints>"
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
# Task

Treat `/task` or `$task` argument as concrete goal. Preserve user scope, acceptance criteria,
and prohibitions. Own work until it lands, is cleanly removed, or is genuinely blocked.

## Start

1. Read nearest `AGENTS.md`, project instructions, git status/branch/worktrees, and active goal.
   Never alter unowned worktrees, branches, queues, or caller-tree changes.
2. Reuse matching active goal. An unrelated active goal is a conflict; do not replace it. In
   Claude, create a goal before detailed planning and use `/goal` only for terminal states.
3. Inspect `<root>/.agent-tmp/task-queue.md` when available. Queue new owned work behind active
   work; drain eligible owned items oldest first. Never report done with owned queued or unmerged work.
4. Resolve target repo and caller base branch. Caller dirty state normally does not block: preserve it
   read-only and branch from committed `HEAD`. Ask only when user requires uncommitted changes.
5. For `inspect` findings, read caller-root `.agent-tmp/inspect-findings.md`, act only on findings user
   selected, mark landed findings resolved after cleanup, and never stage that ledger.

## Worktree

For any repo write or implementation plan, create one prepared worktree before detailed file inspection:

```bash
node ~/.claude/skills/task/scripts/task-worktree-create.mjs <slug> \
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

1. Before running commands, make a coverage matrix whose items include gate, package/suite, behavior,
   environment, and snapshot. Inspect command definitions and CI jobs for overlap and subsumption, then
   assign each item to one authoritative provider minimizing total resource cost, feedback latency, and
   failure-localization cost. A focused command runs only when it owns an
   item; it is not separately mandatory. If a broader provider cannot exclude an already-run subset, choose
   one provider instead of combining both. Changed behavior needs regression coverage unless genuinely
   untestable; explain any exception. UI work needs live browser verification or screenshot/render evidence;
   code inspection alone is insufficient.
2. Count exact-snapshot evidence once, regardless of whether it came from a focused command, aggregate
   verifier, or CI. Required CI still runs when repository policy demands it, so assign its known coverage
   before selecting local providers. Do not assume gates with different names are independent: for example,
   lint may subsume typechecking or an aggregate script may own several gates. Use `task-verify` only for
   explicitly selected uncovered gates after this analysis:
   When verification/harness maintenance is in scope, simplify structurally duplicated scripts or CI;
   otherwise report one optional improvement without creating owned side work.

```bash
node ~/.claude/skills/task/scripts/task-verify.mjs --base <recorded-base> \
  --gate <test|lint|typecheck|build> [--gate ...] [--package <relative-root>]...
```

   Pass `--gate` and, for partial monorepo ownership, `--package` only for uncovered, non-subsumed items;
   there is no implicit all-gates mode. Treat
   unsupported-package/no-command output as documented N/A, not a green substitute for project gates.
   Database soft-skips and any relevant red gate fail verification. Record reused or deferred evidence and
   its provider and snapshot fingerprint. Dirty/untracked evidence applies only to that exact content.
   Rerun only gates invalidated by code, base, dependency, configuration, relevant environment, or coverage
   changes, or when reproducing a failure; elapsed time alone does not invalidate evidence.
   Keep available runners; apply repo/workflow concurrency caps only from measured saturation, and tune
   per-job parallelism before reducing runner count.
   Concurrent runners must isolate databases/schemas, service namespaces, ports, and mutable temp state.
3. Every QA round needs two independent reviewer agents against the verbatim user request, current diff,
   and the broader affected behavior and integration surface. Never restrict reviewers to only changed
   lines or a microtask-sized slice. Make each prompt task-specific: include all acceptance criteria and
   corrections, plausible ways the result could appear correct while still being wrong, and the direct evidence
   needed to rule them out. Give reviewers complementary perspectives suited to the change. They must provide
   requirement evidence and severity-tagged findings; do not accept zero findings while material requirements
   or failure modes remain unverified.
   Reviewers must independently reconcile the verbatim request and later corrections with the stated acceptance
   criteria, reporting any mismatch instead of inheriting the primary agent's interpretation.
   Fix actionable findings, then rerun affected verification and fresh review after behavior changes. Do
   not call self-review QA-clean; unavailable reviewers are a blocker. Continue while progress exists;
   report exact unresolved blocker otherwise.
4. Review correctness, security, tests, docs, project architecture, and UI information duplication.
   Findings need severity, location, impact, and required fix. Stop only at zero findings or zero valid
   actionable findings with concrete reasons for invalid findings.

## Commit and land

1. Stage explicit changed paths only. Commit after QA is clean using Conventional Commit style matching
   recent history; inspect status afterward. Never blanket-stage caller-tree changes.
2. Fetch recorded base before landing. Merge and re-verify affected behavior only when fetched base moved
   since the verified merge; do not repeat an unchanged-base merge or already-covered verification.
3. If tracked CI exists, push branch, create/update PR, watch required checks for current head, repair
   task-caused failures, merge only after passing checks, then prove merge commit is ancestor of fetched base.
   Obtain human approval only when platform requires it.
4. Without CI, run this from caller base checkout; it journals and squashes task paths. Never replace it
   with manual reset/commit. Then confirm landed commit on recorded base:

```bash
node ~/.claude/skills/task/scripts/task-finalize.mjs --repo <caller-root> --base <base> \
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
