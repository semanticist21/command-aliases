---
name: "inspect"
description: "Read-only systemic audit that hunts, verifies, and ranks real problems across a codebase or feature — design flaws, correctness bugs, logic holes, durability/idempotency/concurrency gaps, authz-boundary and data-integrity holes, silent failures, long-term operations/policy gaps, layer-contract drift, and UX problems — then hands them off as a findings ledger for task/microtask to fix. Use for inspect, audit, 점검/조사, '이슈 리스트업', 'find issues', 'what's wrong here', 'what could bite us'. Not for reviewing one diff (code-review), root-causing one known bug (analysis/systematic-debugging), trimming over-engineering (ponytail-review / whole-repo ponytail-audit), or deleting unused code (dead-code-removal)."
metadata:
  short-description: Read-only systemic risk audit that lists findings for task/microtask
---
# Inspect

Read-only auditor. Hunt real problems across a target surface, prove each one with
concrete evidence, rank them, and write a findings ledger. **inspect lists; it never
fixes.** No source edits, no commits, no worktree. The only file it writes is the
ledger under `.agent-tmp/`. Fixing is the job of `task` / `microtask`, which read the
same ledger.

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
2. **Correctness bug** — off-by-one, wrong operator/comparison, null/none, inverted
   condition, wrong default, unit/type mismatch.
3. **Logic hole** — unhandled branch/case, contradictory or unreachable conditions,
   missing early return, assumption that does not always hold.
4. **Durability / data loss** — unflushed or unordered writes, lost update, work that
   vanishes on crash/restart, no persistence where state must survive.
5. **Idempotency** — retry/replay/double-submit produces wrong state or double
   effects; handlers that are not safe to run twice.
6. **Concurrency / race** — TOCTOU, lost update, missing lock or version guard,
   interleaving that corrupts state. Distinct from idempotency.
7. **Authz / tenant boundary** — missing owner/tenant/scope filter, IDOR, a caller
   acting on data it does not own, privilege that is not checked.
8. **Silent failure / error contract** — swallowed errors, wrong status/code, a
   failure path that looks like success, a "pass" that actually skipped.
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

A convergent, deterministic loop. **inspect never terminates on self-assessment
("looks fine now") — only on the gate below.** The main thread orchestrates it: fan
out the work, dedup against all-seen, run the gate, rank, and write the ledger.

### 1. FIND — loop until dry

- Fan out finders across the taxonomy over the resolved surface (by category cluster,
  by subsystem, or by file group — whatever splits the work without overlap). Track
  which subsystem/file-group each finder claimed so coverage is known, not assumed.
  Use subagents when available; each finder gets the scope, the conventions to
  respect, and its assigned lens.
- Append every candidate to the ledger's working list.
- **Dedup against everything seen so far — including findings VERIFY already rejected**
  — otherwise a rejected finding reappears every round and the loop never converges.
  Key candidates by **`file + line/symbol`, not by category**: when one root defect
  trips two lenses (e.g. concurrency and idempotency at the same site), collapse them
  into one finding — keep the highest severity, note both lenses — instead of counting
  it twice.
- Run VERIFY (step 2) on each round's new candidates before the next round, so
  rejects join the seen-set immediately. A round whose candidates are all duplicates
  or rejects counts as dry.
- Repeat rounds until **K consecutive rounds surface nothing new** (default K=2), or a
  hard cap trips (see gate). Broad audits deserve a larger finder pool; a focused
  ask deserves fewer.

### 2. VERIFY — adversarial, evidence-grounded

Every candidate must survive an independent skeptic before it can ship:

- The verifier's job is to **refute**, not confirm — never coach it toward a verdict.
  It must read the real code, trace callers, check the schema/contract, or reproduce
  the path. **Default to rejecting any finding that has no concrete evidence** — a
  plausible-sounding claim with no proof is a false positive.
- For **critical/high** severity, use more than one independent verifier and keep the
  finding only if a majority cannot refute it.
- A surviving finding carries its evidence: the exact `path:line`, why it is wrong,
  and a concrete failure scenario (inputs/state → wrong outcome).
- Feed structured findings between stages, never raw dumps. Give each finder/verifier
  fresh context and the ledger as the shared memory — do not let one bloated context
  carry the whole audit (quality degrades as context fills).

### 3. GATE — deterministic termination

Emit the ledger and stop when **all** hold:

- every assigned subsystem/file-group was actually scanned by at least one finder that
  reported completion — K dry rounds alone do **not** prove coverage, since finders
  can come up empty by mis-scoping or running out of context, **and**
- FIND has been dry for K consecutive rounds, **and**
- every surviving finding has passed VERIFY, **and**
- no hard cap was exceeded: max rounds, token/time budget, or a no-progress counter
  (rounds that surface no new verified finding).

Always compute the ledger's `Uncovered:` line honestly — list any subsystem/file-group
left unscanned, whether the run ended clean or on a cap. If a cap tripped before
coverage completed, ship what is verified and say so. Never present a partial audit as
exhaustive; no silent truncation.

## Severity + ranking

Tag each finding `critical` / `high` / `medium` / `low` by blast radius × likelihood:
data loss, security-boundary breaks, and silent corruption rank highest; cosmetic or
speculative issues rank lowest. Order the ledger most-severe first.

## Output — the findings ledger

Write to `<project-root>/.agent-tmp/inspect-findings.md`; resolve the project root
with `git rev-parse --show-toplevel` (if there is none, write the ledger beside the
inspected files and say so). **Do not edit `.gitignore` or any other tracked file —
the ledger is the only thing inspect writes.** If `.agent-tmp/` is not already
git-ignored, note that in the summary and leave adding the ignore to the user or to
task/microtask; never stage or commit the ledger yourself.

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
  (direction only — NOT applied here)
- category: authz | severity: critical | status: open

## F2 — [high] idempotency — ...
```

Every finding: stable id, severity, category (note extra lenses if it tripped more
than one), `path:line`, evidence with a concrete failure scenario, impact, a
**remediation direction only** (inspect does not apply it), and `status: open`.

End the run with a short summary to the user: counts by severity, the top few, the
ledger path, the uncovered surface if any, and the handoff line below.

## Handoff to task / microtask

inspect stops at the ledger. To fix:

> Run `$task` (or `$microtask` for a small one) naming the finding id(s) — e.g.
> `$task fix inspect F1, F3`. Those skills read `.agent-tmp/inspect-findings.md`,
> execute each selected finding through their own plan→build→QA→commit loop, and mark
> it `resolved`. **inspect fixes nothing itself.**

Do not auto-launch task/microtask. The user chooses which findings to act on; listing
and fixing are deliberately separate steps.

## Boundaries

- **Read-only except the ledger.** Never edit source, never edit `.gitignore` or any
  other tracked file, never commit, never push, never create a branch or worktree,
  never run a fix. The single file inspect writes is the ledger under `.agent-tmp/`.
- **Evidence or it is not a finding.** No speculation, no "might be", no style
  opinions dressed as risks. If you cannot show how it fails, drop it.
- **Stay in your lane.** Not `code-review` (correctness+cleanup on one diff), not
  `analysis`/`systematic-debugging` (root-cause one known failure), not
  `ponytail-review`/`ponytail-audit` (over-engineering only), not `dead-code-removal`
  (unused only). inspect is the broad, multi-category, systemic-risk hunt that only
  *lists*.
- **Respect real invariants.** Judge against the repo's documented conventions and
  intended design, not an idealized rewrite. A deliberate, documented tradeoff is not
  a finding.

## Portability

Express the loop as a protocol, not a runtime API. In Codex use its subagent/agent
mechanism for fan-out; in Claude use the `Task` tool / subagents. Where neither is
available, run FIND→VERIFY→GATE sequentially in the main thread with the ledger as
external memory. The gate and the read-only boundary hold on every runtime.
