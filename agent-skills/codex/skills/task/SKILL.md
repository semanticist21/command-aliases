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

Treat the `/task` or `$task` argument as the concrete goal. Preserve the user's scope, acceptance criteria, and prohibitions. Own the work until it lands, is cleanly removed, or is genuinely blocked.

## Root cause

Name variables, methods, and state types after the lifecycle or observable side effect they own, not the generic phase that happens to call them.

For defect work, fix the cause, not where the symptom showed up.

- Establish an evidence-backed chain from the observed failure to the defect in the owning layer — reproduction, logs, traces, state transitions, a violated contract. A plausible theory or a now-passing check is not that evidence.
- Fix it at that layer, whatever the size. Symptom-layer guards, retries, fallbacks, duplicated state, wrappers, suppressed errors or tests, and one-off data repair that leaves the faulty producer in place are not fixes, and stay wrong even next to a real one. A permanent control at its own boundary is fine when it enforces a separate invariant and is independently required.
- Insufficient evidence means keep investigating, not edit speculatively. A fix that needs new product direction is a user decision. A cause you cannot reach is `blocked`, with the owner and the exact required action — not a shipped mitigation.
- Verification has to exercise the original path. The symptom disappearing is not proof.

## Start

1. Read the nearest `AGENTS.md`, project instructions, and git status/branch/worktrees. Never alter unowned worktrees, branches, or caller-tree changes.
2. Reuse a matching active goal; an unrelated one is a conflict, not something to replace.
3. Check `<root>/.agent-tmp/task-queue.md` when present. Queue new owned work behind active work and drain oldest first. Never report done with owned work still queued or unmerged.
4. Resolve the target repo and caller base branch. A dirty caller tree normally does not block: leave it untouched and branch from committed `HEAD`.
5. For `audit` findings, read `.agent-tmp/audit-findings.md`, act only on user-selected ones, mark them resolved after cleanup, and never stage that ledger.

## Worktree

For any repo write, create one prepared worktree before detailed inspection. Use the repo's own wrapper if it has one (some seed build caches, which saves minutes); otherwise:

```bash
node ~/.claude/skills/task/scripts/task-worktree-create.mjs <slug> \
  --id <unique-id> --repo <repo-root> --summary "<task summary>"
```

Record base, branch, path, caller, owner marker, and summary in an ignored `.agent-tmp/task-state.md`. Plan, edit, test, and commit there. After a setup failure repair the retained worktree rather than creating a second. Work in the caller tree only when the user asks, the repo is not git, or worktree setup cannot run — and say which. `--plan-only` means no implementation and no commit; clean it with `task-worktree-plan-cleanup.mjs` only after its state checks pass, never by discarding changes.

## Plan and execute

1. State the plan concisely: acceptance criteria, causal evidence, owning layer, affected paths, risks, and how you will verify. The user usually describes a *symptom*. Find the layer that owns it — frontend, service, schema, migration, API contract, config — and fix there. Patching a nearer layer to dodge a backend or schema change is not "minimal scope".
2. Read nested docs and nearby code before editing. Preserve user changes and project conventions. Load named skills before using their workflows.
3. Use subagents for independent investigation, implementation, or review. Brief them with the verbatim goal, constraints, target paths, and the evidence you expect back. You own judgment, integration, verification, and landing.

## Review budget

Default to reviewing your own diff. Read it in full before you call anything done — most findings are visible there, and a reviewer is not a substitute for having looked.

Bring in **one** independent read-only reviewer when the change touches authentication or authorization, payments or entitlements, a data migration, CI/release/deploy, concurrency, a public API, production configuration, or anything irreversible — or when you are genuinely unsure the cause is right.

Brief a reviewer short: the verbatim user request, the diff, and the one question you want answered. Long briefs make reviewers worse, not better; they read past the specifics and restate the prompt. Let them come back with severity-tagged findings and their evidence.

A finding is actionable when it cites the governing user requirement or project policy, or shows a reproducible correctness, security, regression, accessibility, or integration defect. Reject preference, speculation without an observed failure, and anything contradicting a settled product decision — with the reason. UI copy, layout, and style are not findings unless they break an explicit request or a canonical design/accessibility/i18n rule. You adjudicate; do not apply a suggestion merely because it was made. When the sources genuinely conflict and the product choice is unstated, ask the user rather than letting a reviewer decide.

Weakening security controls, expanding privileges, exposing secrets, passing untrusted input into a model or shell, or adding production write access needs the risk evidenced and accepted by the user before it lands.

## Verify

1. Run the repo's gates for the changed paths — lint, test, typecheck, build. Do not assume differently-named gates are independent: lint may subsume typecheck, and an aggregate script may own several. Reuse valid evidence; rerun only what code, base, deps, config, env, or coverage changes invalidated. Elapsed time alone invalidates nothing.
2. For a defect fix, verification must cover the causal path, not just the symptom. Changed behavior needs regression coverage unless it is genuinely untestable — say which. For UI work, look at the actual screen when you reasonably can; a render or screenshot beats reading the diff.
3. `task-verify` only for gates the repo does not already cover:

```bash
node ~/.claude/skills/task/scripts/task-verify.mjs --base <recorded-base> \
  --gate <test|lint|typecheck|build> [--gate ...] [--package <relative-root>]...
```

   There is no implicit all-gates mode. Unsupported-package output is a documented N/A, not a pass. A red gate on a path you touched fails verification. Concurrent runners must isolate databases, ports, and mutable temp state.

## Commit and land

1. Stage explicit changed paths only — never blanket-stage a shared tree. Commit in the repo's existing Conventional Commit style and inspect `git status` afterward.
2. Fetch the recorded base before landing. Merge and re-verify only if it moved since you verified.
3. Follow the repo's landing policy for CI. Where checks are advisory or unenforceable, push, open the PR, merge, and move on — do not sit in a polling loop waiting on a check that gates nothing. Where they are enforced, let the platform hold the merge rather than watching it yourself.
4. When the repo has no CI at all and no pull-request landing policy, record the resource inventory (step 5) from the caller checkout *before* finalizing, then:

```bash
node ~/.claude/skills/task/scripts/task-finalize.mjs --repo <caller-root> --base <base> \
  --branch <task-branch> --worktree <task-worktree> --slug <slug> --head <task-head>
```

5. Journal task-owned resources only when the task actually created some beyond the worktree and branch — a container, a volume, a generated tree. Keep it in an ignored scratch file by task ID: type, namespace, ID, creation marker, owner evidence, and the query that finds it. A shared or default Compose project is not ownership proof. **Delete the journal once every resource in it is verified gone** — a journal outliving its task reads as live state to the next session.
6. Clean up in order — worktree, local branch, remote ref — because `gh pr merge --delete-branch` skips a branch a worktree still holds. Verify each with `git worktree list`, `git branch --list <branch>`, and `git ls-remote --heads origin <branch>`. Use the repo's scoped cleanup command when it has one; a broad orphan sweep is not task cleanup. Re-check PID, container attachment, and DB use immediately before stopping anything, and treat stopping a container and deleting its volume as separate decisions. Never touch the primary stack or any resource whose ownership you cannot prove.
7. Cleanup is per round of work. Before finishing any round, re-run steps 5-6 over every still-present owned resource, including ones an earlier round left behind.
8. A cleanup report names each resource: ID, action, command and result, the query proving absence, and what deliberately survived with its reason. "Cleaned up" without identifiers is not a report.

## Output

Report: what changed; causal evidence and owning layer for a defect fix; verification evidence; whether a reviewer was used and what survived review; per-resource cleanup with exact identifiers and what deliberately survives; goal status; commits; any decision you need from the user. End with one concise Korean summary sentence.

## Closure

1. Before any final response, inventory what is unresolved across the request, plan, queue, verification, review, landing, and cleanup. Reporting an item is not resolving it. Do not finish while something in scope is still executable by you.
2. When only a user decision remains, ask it — one focused question at a time — and act on the answer. Do not defer a known decision into a summary or an optional follow-up.
3. `complete` means zero unresolved in-scope items and zero owned resources still present except those journalled with a stated reason. This includes **the scratch files this task wrote** — state, queue, journal, plan, findings: delete the ones whose purpose is served, in this round. Optional improvements outside the goal are out of scope, not residual risk; label them that way.
4. `blocked` is only for a condition neither you nor a user decision can clear. Record the evidence, the external owner, and the exact unblock action. A failed attempt or a risky outcome is not a blocker.

## Safety

- Never stash, reset, overwrite, delete, or move user work. Only the documented finalizer recovery may use its scoped reset, after its proof checks.
- Never ship a workaround as completion, even alongside a real fix.
- Budget exhaustion is not closure: preserve active status and the owned queue for continuation.
- Do not claim checks, merges, or UI verification you did not actually observe.
