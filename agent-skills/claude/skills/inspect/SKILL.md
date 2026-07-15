---
name: "inspect"
description: "Read-only systemic audit that hunts, verifies, and ranks real problems across a codebase or feature — design flaws, correctness bugs, logic holes, durability/idempotency/concurrency gaps, authz-boundary and data-integrity holes, silent failures, long-term operations/policy gaps, layer-contract drift, and UX problems — then hands them off as a findings ledger for task/microtask to fix. Use for inspect, audit, 점검/조사, '이슈 리스트업', 'find issues', 'what's wrong here', 'what could bite us'. Not for reviewing one diff (code-review), root-causing one known bug (analysis/systematic-debugging), trimming over-engineering (ponytail-review / whole-repo ponytail-audit), or deleting unused code (dead-code-removal)."
user-invocable: true
argument-hint: "<surface to inspect + any focus/constraints>"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash(cd*)
  - Bash(ls*)
  - Bash(cat*)
  - Bash(wc*)
  - Bash(find*)
  - Bash(test*)
  - Bash(mkdir*)
  - Bash(rg*)
  - Bash(git rev-parse*)
  - Bash(git -C*)
  - Bash(git status*)
  - Bash(git diff*)
  - Bash(git log*)
  - Bash(git grep*)
  - Bash(git ls-files*)
  - Task
---
# Inspect

Read-only auditor. Hunt real problems across a target surface, prove each with concrete
evidence, rank them, and write a ranked findings ledger under `.agent-tmp/` — the only
file it writes. **inspect lists; it never fixes:** fixing is the job of `task` /
`microtask`, which read the same ledger.

## Input

Treat the `/inspect` or `$inspect` argument as the surface + focus. Resolve the
scope explicitly before hunting:

- **Whole repo / subsystem / directory / feature** — default to what the argument
  names; if it names nothing, inspect the repo at its current `HEAD`.
- **A change / diff / branch** — allowed, but say so; for a narrow diff-correctness
  pass prefer `code-review` instead.
- Honor any focus ("only concurrency", "auth paths", "the billing flow") and any
  "do not look at" constraint. State the resolved scope in the ledger header.

Read the nearest `AGENTS.md`/`CLAUDE.md`, relevant `doc/`, and the repo shape first
so findings respect real conventions and intended invariants — not invented ones.

## What to hunt (risk taxonomy)

Scan every **core** category. Add the **extended** ones when the surface touches
them. A category is a lens, not a quota — report what is real, skip what is not.

**Core**
1. **Design flaw** — wrong/leaky abstraction, misplaced responsibility, a boundary
   that will force ugly changes later.
2. **Correctness bug** — the code does the wrong thing on a path it *does* handle:
   off-by-one, wrong operator/comparison, null/none, inverted condition, wrong default,
   unit/type mismatch.
3. **Logic hole** — a case the code *never* handles: unhandled branch, contradictory
   or unreachable conditions, missing early return, an assumption that does not always
   hold.
4. **Durability / data loss** — unflushed or unordered writes, work that vanishes on
   crash/restart, no persistence where state must survive.
5. **Idempotency** — retry/replay/double-submit produces wrong state or double
   effects; handlers that are not safe to run twice.
6. **Concurrency / race** — TOCTOU, lost update, missing lock or version guard,
   interleaving that corrupts state. Distinct from idempotency.
7. **Authz / tenant boundary** — missing owner/tenant/scope filter, IDOR, a caller
   acting on data it does not own, privilege that is not checked.
8. **Silent failure / error contract** — swallowed errors, wrong status/code, a
   failure path that returns success.
9. **Referential integrity** — orphaned or dangling references, broken FK/soft-delete
   links, a delete that strands dependents.
10. **Long-term operations / missing policy** — unbounded growth, no
    retention/cleanup/limit/backpressure/migration/rotation policy, a resource that
    only ever accumulates.
11. **Layer-contract drift** — schema/API/proto/client/DB out of agreement, UI label
    coupled to a stored/wire value, one consumer that did not get the change.
12. **UX problem** — confusing or inconsistent flow, dead-end state, missing
    empty/error/loading state, duplicated visible information, an action with no
    feedback.

**Extended** (flag when relevant; lower priority than core)
- **Performance** — N+1, unbounded query/result, work in a hot loop, missing index.
- **Cache / invalidation** — stale reads, immutable-cache traps, no bust on change.
- **Test trust** — tests that assert nothing, silent-skip that reads as pass, missing
  coverage on changed-and-risky logic.
- **Accessibility** — unreachable controls, missing labels/focus, tiny touch targets.

## Loop (find → verify → gate)

A convergent, deterministic loop. **inspect terminates only on the gate below, never on
self-assessment ("looks fine now").** The main thread orchestrates: fan out the work,
dedup against all-seen, run the gate, rank, write the ledger.

### 1. FIND — loop until dry

- Fan out finders across the taxonomy over the resolved surface (by category cluster,
  by subsystem, or by file group — whatever splits the work without overlap). Each
  finder returns an explicit coverage line naming what it scanned; a bare empty result
  is not coverage. Use subagents when available; each finder gets the scope, the
  conventions to respect, and its assigned lens.
- **Dedup against everything seen so far — including findings VERIFY already rejected**
  — otherwise a rejected finding reappears every round and the loop never converges.
  Key candidates by **`file + line/symbol`, not by category**: when one root defect
  trips two lenses (e.g. concurrency and idempotency at the same site), collapse them
  into one finding — keep the highest severity, note both lenses — instead of counting
  it twice.
- Run VERIFY (step 2) on each round's new candidates before the next round, so rejects
  join the seen-set immediately. A round whose candidates are all duplicates or rejects
  counts as dry.
- Repeat until **K consecutive rounds are dry** (default K=2), or a hard cap trips
  (see gate). Broad audits deserve a larger finder pool; a focused ask deserves fewer.

### 2. VERIFY — adversarial, evidence-grounded

Every candidate must survive an independent skeptic before it can ship:

- The verifier's job is to **refute**, not confirm — never coach it toward a verdict.
  It reads the real code, traces callers, checks the schema/contract, or reproduces the
  path. **Default to rejecting any finding with no concrete evidence** — a
  plausible-sounding claim with no proof is a false positive.
- For **critical/high** severity, use two independent verifiers and drop the finding if
  either refutes it with concrete evidence.
- A surviving finding carries its evidence: the exact `path:line`, why it is wrong, and
  a concrete failure scenario (inputs/state → wrong outcome).
- Feed structured findings between stages, never raw dumps. Give each finder/verifier
  fresh context and the ledger as shared memory; do not let one bloated context carry
  the whole audit.

### 3. GATE — deterministic termination

Emit the ledger and stop when **all** hold:

- every assigned subsystem/file-group was actually scanned — a finder claimed and
  reported it (K dry rounds alone do **not** prove coverage), **and**
- FIND has been dry for K consecutive rounds, **and**
- every surviving finding has passed VERIFY, **and**
- no hard cap tripped: max rounds (default 6), or the run's token/time budget.

Always compute the ledger's `Uncovered:` line honestly — list any subsystem/file-group
left unscanned, whether the run ended clean or on a cap. If a cap tripped before
coverage completed, ship what is verified and say so. Never present a partial audit as
exhaustive; no silent truncation.

## Severity + ranking

Tag each finding `critical` / `high` / `medium` / `low` by blast radius × likelihood:
data loss, security-boundary breaks, and silent corruption rank highest; cosmetic or
speculative issues rank lowest. Order the ledger most-severe first.

## Output — the findings ledger

Write to `<project-root>/.agent-tmp/inspect-findings.md`; resolve the project root with
`git rev-parse --show-toplevel` (if there is none, write beside the inspected files and
say so). Create `.agent-tmp/` if absent. If it is not already git-ignored, note that in
the summary and leave adding the ignore to the user or task/microtask; never stage or
commit the ledger.

Header, then one block per finding, ranked:

```
# Inspect findings — <surface>
Scope: <what was inspected>   Rounds: <N>   Verified: <M>/<candidates>
Uncovered: <anything left unscanned, or "none">

## F1 — [critical] authz — order endpoint skips household scoping
- where: server/src/orders.rs:142 (+ handler at :98)
- evidence: query filters by order_id only; any authenticated caller can read another
  household's order. Repro: call GetOrder with an id owned by household B while
  authed as household A → returns B's row.
- impact: cross-tenant data disclosure for every order-read path.
- remediation: add the caller's household_id to the WHERE clause; reject on mismatch.
- category: authz | severity: critical | status: open

## F2 — [high] idempotency — ...
```

Every finding: stable id, severity, category (note extra lenses if it tripped more than
one), `path:line`, evidence with a concrete failure scenario, impact, a **remediation
direction only**, and `status: open`.

End the run with a short summary: counts by severity, the top few, the ledger path, the
uncovered surface if any, and the handoff line below.

## Handoff to task / microtask

inspect stops at the ledger. To fix:

> Run `$task` (or `$microtask` for a small one) naming the finding id(s) — e.g.
> `$task fix inspect F1, F3`. Those skills read `.agent-tmp/inspect-findings.md`,
> execute each selected finding through their own plan→build→QA→commit loop, and mark
> it `resolved`.

Do not auto-launch task/microtask — the user chooses which findings to act on.

## Boundaries

- **Read-only except the ledger.** Never edit source, `.gitignore`, or any tracked
  file; never commit, push, branch, or create a worktree; never run a fix. The ledger
  under `.agent-tmp/` is the only thing inspect writes.
- **Evidence or it is not a finding.** No speculation, no "might be", no style opinions
  dressed as risks; a deliberate, documented tradeoff is not a finding. If you cannot
  show how it fails, drop it.
- **Stay in your lane.** The frontmatter names the siblings inspect is *not*
  (code-review, analysis/systematic-debugging, ponytail-review/audit, dead-code-removal);
  inspect is the broad, multi-category systemic hunt that only *lists*.

## Portability

Express the loop as a protocol, not a runtime API. In Claude use the `Task`
tool / subagents for fan-out; in Codex use its subagent/agent mechanism. Where neither
is available, run FIND→VERIFY→GATE sequentially in the main thread with the ledger as
external memory. The gate and the read-only boundary hold on every runtime.
