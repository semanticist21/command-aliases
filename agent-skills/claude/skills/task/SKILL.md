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
  - Bash(git fetch*)
  - Bash(git ls-remote*)
  - Bash(git push*)
  - Bash(gh*)
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
- Prior owned task complete but uncleaned: land only with known recorded base, then clean. For unknown
  ownership/base, an unfinished git operation, or ambiguous overlap, exhaust safe read-only investigation;
  use `grill-me` if a user decision can resolve it, and classify it as blocked only under the Closure gate.

## Plan and execute

1. State concise plan: acceptance criteria, root-cause evidence and causal chain, owning layer, affected paths, rejected workarounds, risks, verification, and independent work. The user usually describes a *symptom*, not the fix location: locate the layer that owns the cause (frontend / backend service / DB schema / migration / API contract / config) and fix there. A patch in the layer where the symptom surfaces is acceptable only when that layer genuinely owns the cause — not as a shortcut to avoid a backend/DB change.
2. Read nested docs and nearby code before edits. Satisfy the Root-cause rule before implementation. Keep scope minimal *within the owning layer(s)* — "minimal" never means patching a nearer layer to dodge a backend/DB/schema/contract change. If the symptom-layer fix is cheaper but the cause lives elsewhere, the cause layer is the scope regardless of work size. Preserve user changes and project conventions. Load named/relevant skills before using their workflows.
3. Use subagents for independent investigation, implementation, or QA. Brief them with verbatim user goal, constraints, target paths, base/worktree, expected evidence. Main agent owns judgment, integration, verification, landing.
4. Track meaningful queue items in `.agent-tmp/task-queue.md` with owner, base, status, landed commit. Never queue work owned by another session.

## Review budget

Review depth is risk-adaptive, not an automatic multiplier for agent-authored work. Classify the change
before QA and record the selected tier in the final report:

- `trivial`: docs, copy, formatting, or metadata-only changes, or one-file mechanical edits with no
  executable behavior, security/permissions, CI/release, data, public API, or workflow-policy impact.
  The primary agent performs a diff self-review and the relevant gate. Add one independent read-only
  reviewer when the edit changes a skill/policy, landing/cleanup behavior, or acceptance is ambiguous.
- `standard`: behavioral code, tests, architecture/docs changes, or multi-file changes. Use one
  independent read-only reviewer against the verbatim request, current diff, and affected integration
  surface.
- `high-risk`: authentication/authorization, security boundaries, migrations or data, CI/release/deploy,
  concurrency, public APIs, production configuration, root-cause fixes, irreversible changes, or an
  uncertain causal chain. Use two independent reviewers with complementary perspectives; if the scope
  becomes high-risk during review, escalate to this tier.

If the tier is unclear, choose the higher one. Agent authorship alone does not raise the tier. The author
must inspect the diff before delegation, and automated checks should filter mechanical failures first.
Reviewers should start from the diff, form narrow questions, and read only the focused evidence needed to
answer them; do not spend reviewer budget on duplicated broad repository exploration. Review evidence and
tests remain gates, while the main agent retains final technical judgment; for standard changes, that means
evidence-backed adjudication of reviewer findings, never an unsupported override. Material unresolved
disagreement escalates to the high-risk tier or a user decision. For high-risk and hard-stop items,
responsible-human acceptance is mandatory; a reviewer is not an approval substitute. This is a technical
adjudication rule, not a blanket human sign-off gate for standard changes; existing project and platform
approval policies remain controlling.
Regardless of tier, weakening CI, expanding privileges, exposing secrets, passing untrusted input into a
model or shell, or adding production write access is a hard stop until the risk is directly evidenced,
corrected, and explicitly accepted by the responsible human. If a repository repeatedly uses `trivial`,
sample completed changes periodically; a missed issue raises the affected pattern to `standard` until the
classification rule is corrected.

## Verify and QA

1. Run standard gates (lint, test, typecheck, build) on changed paths. Don't assume differently-named gates are independent: lint may subsume typecheck, an aggregate script may own several gates. When a broader provider covers a gate, don't rerun a focused one. Count exact-snapshot evidence once. Reuse valid evidence; rerun only gates invalidated by code, base, deps, config, env, or coverage changes, or when reproducing a failure — elapsed time alone doesn't invalidate. Required CI still runs when repo policy demands it. For a problem fix, verification must cover the identified causal path and owning-layer correction; a symptom-only assertion is insufficient. Changed behavior needs regression coverage unless genuinely untestable (explain exception). UI work needs live browser or screenshot/render evidence; code inspection alone is insufficient.
2. `task-verify` only for explicitly uncovered gates:

```bash
node ~/.claude/skills/task/scripts/task-verify.mjs --base <recorded-base> \
  --gate <test|lint|typecheck|build> [--gate ...] [--package <relative-root>]...
```

   No implicit all-gates mode. Treat unsupported-package/no-command output as documented N/A, not green. Database soft-skips and any relevant red gate fail verification. Keep available runners; apply concurrency caps only from measured saturation, tune per-job parallelism before reducing runner count. Concurrent runners must isolate databases/schemas, service namespaces, ports, mutable temp state. When verification/harness maintenance is in scope, simplify structurally duplicated scripts or CI; otherwise report one optional improvement without creating owned side work.

3. Apply the selected review tier. For each assigned independent reviewer, provide the verbatim user request,
   current diff, affected integration surface, acceptance criteria, plausible false positives, and direct
   evidence needed to rule them out. Each reviewer must challenge the causal chain and explicitly answer:
   is the identified cause supported by direct evidence, and is the fix in the owning layer rather than a
   symptom-layer monkey patch? Reviewers must cite owning-layer code and verification evidence, and flag
   a wrong-layer or mitigation-only fix even when visible criteria pass. They must provide requirement
   evidence and severity-tagged findings. Do not declare QA clean while material requirements or failure
   modes remain unverified: record verification gaps, obtain missing evidence, and never invent a finding
   solely because evidence is missing. Reviewers independently reconcile the request with acceptance
   criteria rather than inheriting the primary agent's interpretation. Fix actionable findings, rerun
   affected verification, and repeat the assigned tier after behavior changes. Do not call self-review
   QA-clean when the selected tier requires an independent reviewer. If reviewers are unavailable, exhaust
   retry and alternate paths; use `grill-me` for a user-controlled resolution, and classify the condition
   as blocked only under the Closure gate. Continue while progress exists.

4. Review correctness, security, tests, docs, architecture, and UI duplication. A finding is actionable only
   when it cites the exact governing user requirement or canonical project policy, or supplies direct,
   reproducible evidence of a correctness, security, regression, accessibility, or integration defect. It
   must identify severity, location, concrete impact, evidence, and the required outcome. Reject findings
   that contradict a governing policy, ignore an explicit product decision, merely restate reviewer
   preference, or propose speculative cleanup without an observed failure. Do not apply a reviewer suggestion
   merely because it was reported; adjudicate it against the cited source and evidence.
5. UI labels, copy, layout, and style opinions are not findings unless they violate an explicit user request,
   canonical design/accessibility/internationalization rule, or demonstrably worsen observable behavior. A
   reviewer proposing a UI change must cite that rule or evidence and explain why the required outcome is an
   improvement without overriding settled product policy. When sources genuinely conflict or the correct
   product choice is unstated, do not let the reviewer choose; use `grill-me` under the Closure gate. Stop only
   at zero findings or zero valid actionable findings, with concrete rejection reasons for every invalid one.

## Commit and land

1. Stage explicit changed paths only. Commit after QA clean using Conventional Commit style matching recent history; inspect status afterward. Never blanket-stage caller-tree changes.
2. Fetch recorded base before landing. Merge and re-verify affected behavior only when fetched base moved since verified merge; do not repeat unchanged-base merge or already-covered verification.
3. With tracked CI: push branch, create/update PR, watch required checks for current head, repair task-caused failures, merge only after passing checks, prove merge commit is ancestor of fetched base. Human approval only when platform requires.
4. Without CI, from the caller base checkout, record the exact resource inventory outside the removable
   worktree before invoking finalization; then journal and squash task paths. Never replace this with manual
   reset/commit. Confirm the landed commit on the recorded base:

```bash
node ~/.claude/skills/task/scripts/task-finalize.mjs --repo <caller-root> --base <base> \
  --branch <task-branch> --worktree <task-worktree> --slug <slug> --head <task-head>
```

5. Before invoking `task-finalize` or any landing cleanup that can remove the worktree, record an inventory
   in a caller-side ignored task journal keyed by task ID (for example `.agent-tmp/task-resources/<task-id>.md`).
   Include each task-owned temporary resource's type/namespace/ID, creation-time task/launch marker, owner
   evidence, discovery query, and current-use result. A Compose project is only a handle when paired with a
   unique task or launch marker and a current-use check; a shared/default project is not ownership proof.
6. After landing, remove the task worktree first, then the landed local branch, then the branch's pushed
   remote ref — `gh pr merge --delete-branch` skips a branch a worktree still holds. Verify each with
   `git worktree list`, `git branch --list <branch>`, and `git ls-remote --heads origin <branch>`; run
   `git push origin --delete <branch>` when the remote ref survives, and re-query after every deletion.
   Release only exact resource matches through a repository-specific scoped cleanup adapter that
   accepts those recorded IDs; if the repo
   has only a broad orphan sweep, do not use it as task cleanup. Recheck process PID/command/launch marker,
   container attachment, and DB current use immediately before every stop or volume deletion. Treat stopping
   a container/process and deleting its DB volume as separate actions; volume deletion requires explicit
   authorization and proven quiescence. Never remove the primary stack or touch active, dirty, or unowned
   resources. If the adapter is unavailable, cleanup fails, any post-action query fails or still finds an
   owned resource, or ownership/current use/quiescence is unknown, retain the journal and exhaust safe
   investigation. Use `grill-me` if a user decision can resolve the condition; classify it as blocked only
   under the Closure gate, with direct evidence, the external owner, and the exact unblock action. Complete
   only after every owned resource has a successful action and verified absence.
7. Cleanup is per round of work, not once per session. Before finishing any round, re-run steps 5-6 over
   every still-present task-owned resource: those created this round, and any earlier-round resource whose
   absence was never verified. Never carry owned resources forward on the assumption that a later round
   will collect them, and never treat an earlier cleanup report as covering resources created or surviving
   after it.
8. Every cleanup report states, per category, each resource's ID, owner evidence, action, command/result,
   post-action result, and what deliberately survived with its reason: worktrees, local branches, remote
   branches, database stacks/containers, volumes, networks, and generated or scratch directories.
   "Cleaned up" without those identifiers is not a report.

## Output

Final response: changed work; root-cause evidence and owning layer for problem fixes; verification evidence;
review tier, QA rounds, and final/valid finding counts; per-resource cleanup action, exact identifier, owner evidence,
command/result, post-action query/result, preservation reason, or blocker, grouped by the Commit and land
step 8 categories so a reader can tell at a glance what is gone and what deliberately survives;
goal status; commit(s); required
user decision or residual blocker. End with one concise Korean summary sentence.

## Closure gate

1. Before any final response, inventory every unresolved item and residual risk from the request, plan, queue,
   verification, reviewer findings, landing, CI, cleanup, and newly discovered scope. A report is not a
   resolution. Do not finish while any in-scope action remains executable by the agent; perform it and repeat
   the inventory after each resulting change.
2. When agent-executable work is exhausted but a user choice, authority grant, acceptance decision, or missing
   fact still controls completion, invoke `grill-me`. Ask one focused question at a time, wait for the answer,
   act on it, and repeat the inventory and question loop until no such decision remains. Do not defer a known
   decision to a final summary or convert it into an optional follow-up.
3. `complete` requires zero unresolved items and zero in-scope residual risks, and zero task-owned resources
   still present except those journalled with an explicit preservation reason under Commit and land step 6.
   Re-run the resource inventory as the last check before every final response, including a response that
   only reports follow-up work, so no round closes over a resource an earlier cleanup left behind.
   Optional improvements outside
   the explicit goal are not residual task risk, but label them as out of scope rather than silently treating
   them as required work.
4. `blocked` is allowed only for an externally unremovable condition that neither agent action nor a user
   decision can currently clear. Record direct blocker evidence, the external owner, the exact unblock action,
   and why further questioning cannot resolve it. A vague dependency, failed attempt, missing convenience, or
   merely risky outcome is not a blocker; continue working or use the `grill-me` loop.

## Safety

- Never stash, reset, overwrite, delete, or move user work. Only documented task finalizer recovery may use its scoped reset after every proof check.
- Never ship a monkey patch or temporary workaround, even alongside a root fix, or describe one as task completion.
- Do not weaken user or repository constraints to claim completion. Budget exhaustion is not closure: preserve
  active status and the exact owned queue for continuation, then resume through the Closure gate.
- Do not claim external checks, merges, or UI verification without direct evidence.
