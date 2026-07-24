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

Treat `/task` or `$task` argument as concrete goal. Preserve user scope, acceptance criteria, prohibitions. Own work until it lands, is cleanly removed, or is genuinely blocked.

## Root-cause rule

For defect and problem-solving work, root-cause resolution is a non-negotiable gate:

1. Before choosing or implementing a fix, establish an evidence-backed causal chain from the observed
   failure through the responsible boundary to the defect in the owning layer. Use reproduction,
   logs/traces, state transitions, contract violations, or equivalent direct evidence. Correlation, a
   plausible theory, the symptom's location, or a passing acceptance check is not root-cause proof.
2. Fix the identified defect at its owning source. Scope, cost, schedule, or implementation size never
   justify substituting a nearer workaround. Forbidden substitutes include symptom-layer guards or
   formatting, retries or fallbacks, duplicated state/config, wrappers or monkey patches, error/test
   suppression, and one-off data repair that leaves the faulty producer in place. Monkey patches and
   temporary workaround artifacts remain forbidden even after the root fix. A permanent defense-in-depth
   control is allowed only when it enforces a separate invariant at its own owning boundary, is independently
   required, and neither masks, duplicates, nor compensates for the original defect.
3. If the evidence is insufficient, keep investigating rather than editing speculatively. If the root fix
   requires new product direction, authority, or scope, stop and request an explicit user decision. If the
   cause or required access is external and cannot be changed, report `blocked` with the evidence, owner,
   and exact required action; do not ship a temporary mitigation.
4. Do not declare the problem solved until verification exercises the original causal path and proves the
   owning defect is removed. The visible symptom disappearing by itself is not completion evidence.

## Start

1. Read nearest `AGENTS.md`, project instructions, git status/branch/worktrees, active goal. Never alter unowned worktrees, branches, queues, or caller-tree changes.
2. Reuse matching active goal. Unrelated active goal = conflict; do not replace it.
3. Inspect `<root>/.agent-tmp/task-queue.md` when available. Queue new owned work behind active; drain oldest first. Never report done with queued or unmerged owned work.
4. Resolve target repo and caller base branch. Caller dirty state normally does not block: preserve read-only, branch from committed `HEAD`. Ask only if user requires uncommitted changes.
5. For `audit` findings, read caller-root `.agent-tmp/audit-findings.md`, act only on user-selected findings, mark landed findings resolved after cleanup, never stage that ledger.

## Worktree

For any repo write or implementation plan, create one prepared worktree before detailed inspection:

```bash
node ~/.claude/skills/task/scripts/task-worktree-create.mjs <slug> \
  --id <unique-id> --repo <repo-root> --summary "<task summary>"
```

- Unique lowercase safe slug/ID. Record base, branch, path, caller, owner marker, summary in `.agent-tmp/task-state.md`; keep ignored. Plan, edit, test, commit there.
- Do not create a second worktree after setup failure; repair retained one. Work in caller tree only if user explicitly requests, repo is not git, or worktree setup cannot run (state reason).
- `--plan-only`: do not implement or commit. Clean only with `task-worktree-plan-cleanup.mjs` after its state checks pass. Never discard changes to force cleanup.
- Prior owned task complete but uncleaned: land only with known recorded base, then clean. Unknown ownership/base, unfinished git op, or ambiguous overlap = blocker.

## Plan and execute

1. State concise plan: acceptance criteria, root-cause evidence and causal chain, owning layer, affected paths, rejected workarounds, risks, verification, and independent work. The user usually describes a *symptom*, not the fix location: locate the layer that owns the cause (frontend / backend service / DB schema / migration / API contract / config) and fix there. A patch in the layer where the symptom surfaces is acceptable only when that layer genuinely owns the cause — not as a shortcut to avoid a backend/DB change.
2. Read nested docs and nearby code before edits. Satisfy the Root-cause rule before implementation. Keep scope minimal *within the owning layer(s)* — "minimal" never means patching a nearer layer to dodge a backend/DB/schema/contract change. If the symptom-layer fix is cheaper but the cause lives elsewhere, the cause layer is the scope regardless of work size. Preserve user changes and project conventions. Load named/relevant skills before using their workflows.
3. Use subagents for independent investigation, implementation, or QA. Brief them with verbatim user goal, constraints, target paths, base/worktree, expected evidence. Main agent owns judgment, integration, verification, landing.
4. Track meaningful queue items in `.agent-tmp/task-queue.md` with owner, base, status, landed commit. Never queue work owned by another session.

## Verify and QA

1. Run standard gates (lint, test, typecheck, build) on changed paths. Don't assume differently-named gates are independent: lint may subsume typecheck, an aggregate script may own several gates. When a broader provider covers a gate, don't rerun a focused one. Count exact-snapshot evidence once. Reuse valid evidence; rerun only gates invalidated by code, base, deps, config, env, or coverage changes, or when reproducing a failure — elapsed time alone doesn't invalidate. Required CI still runs when repo policy demands it. For a problem fix, verification must cover the identified causal path and owning-layer correction; a symptom-only assertion is insufficient. Changed behavior needs regression coverage unless genuinely untestable (explain exception). UI work needs live browser or screenshot/render evidence; code inspection alone is insufficient.
2. `task-verify` only for explicitly uncovered gates:

```bash
node ~/.claude/skills/task/scripts/task-verify.mjs --base <recorded-base> \
  --gate <test|lint|typecheck|build> [--gate ...] [--package <relative-root>]...
```

   No implicit all-gates mode. Treat unsupported-package/no-command output as documented N/A, not green. Database soft-skips and any relevant red gate fail verification. Keep available runners; apply concurrency caps only from measured saturation, tune per-job parallelism before reducing runner count. Concurrent runners must isolate databases/schemas, service namespaces, ports, mutable temp state. When verification/harness maintenance is in scope, simplify structurally duplicated scripts or CI; otherwise report one optional improvement without creating owned side work.

3. Every QA round needs two independent reviewer agents against verbatim user request, current diff, and broader affected behavior/integration surface. Never restrict reviewers to only changed lines or a microtask-sized slice. Each prompt task-specific: all acceptance criteria and corrections, plausible ways the result could appear correct while still wrong, direct evidence needed to rule them out. Complementary perspectives. Each reviewer must independently challenge the causal chain and explicitly answer: is the identified cause supported by direct evidence, and is the fix in the layer that owns it rather than a symptom-layer monkey patch (e.g., frontend formatting/branching/guard that masks a backend/DB/schema/migration/API-contract defect)? Reviewers must cite the owning layer's code and verification evidence that justify the chosen fix location, and must flag a wrong-layer or mitigation-only fix even if the visible acceptance criteria pass. They must provide requirement evidence and severity-tagged findings; do not accept zero findings while material requirements or failure modes remain unverified. Reviewers independently reconcile verbatim request and later corrections with stated acceptance criteria, reporting mismatch instead of inheriting the primary agent's interpretation. Fix actionable findings, rerun affected verification and fresh review after behavior changes. Do not call self-review QA-clean; unavailable reviewers = blocker. Continue while progress exists; report exact unresolved blocker otherwise.

4. Review correctness, security, tests, docs, architecture, UI duplication. Findings need severity, location, impact, required fix. Stop only at zero findings or zero valid actionable findings with concrete reasons for invalid findings.

## Commit and land

1. Stage explicit changed paths only. Commit after QA clean using Conventional Commit style matching recent history; inspect status afterward. Never blanket-stage caller-tree changes.
2. Fetch recorded base before landing. Merge and re-verify affected behavior only when fetched base moved since verified merge; do not repeat unchanged-base merge or already-covered verification.
3. With tracked CI: push branch, create/update PR, watch required checks for current head, repair task-caused failures, merge only after passing checks, prove merge commit is ancestor of fetched base. Human approval only when platform requires.
4. Without CI, run from caller base checkout; journals and squashes task paths. Never replace with manual reset/commit. Then confirm landed commit on recorded base:

```bash
node ~/.claude/skills/task/scripts/task-finalize.mjs --repo <caller-root> --base <base> \
  --branch <task-branch> --worktree <task-worktree> --slug <slug> --head <task-head>
```

5. Remove task worktree and branch only after landing. Do not mark complete before cleanup succeeds.

## Output

Final response: changed work; root-cause evidence and owning layer for problem fixes; verification evidence; QA rounds and final/valid finding counts; goal status; commit(s); required user decision or residual blocker. End with one concise Korean summary sentence.

## Safety

- Never stash, reset, overwrite, delete, or move user work. Only documented task finalizer recovery may use its scoped reset after every proof check.
- Never ship a monkey patch or temporary workaround, even alongside a root fix, or describe one as task completion.
- Do not weaken user or repository constraints to claim completion. Budget pause reports landed work, exact blocker, remaining owned queue.
- Do not claim external checks, merges, or UI verification without direct evidence.
