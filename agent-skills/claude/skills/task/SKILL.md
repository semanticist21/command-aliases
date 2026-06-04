---
name: task
description: "Run a development task end-to-end with an agent-first workflow: plan (skippable) → implement → QA. Use when the user invokes /task or phrases work as a task to carry out (e.g. \"task ~ 수정해줄래\", \"task ~ 구현좀 해놓을까\", \"~ 좀 만들어줘\"). Delegates most work to subagents for isolation, reaches for /research when external/unfamiliar knowledge is needed, and uses grill-me only when requirements are genuinely unclear. After the work, if the project carries harness-engineering guidance, updates the relevant docs and runs lint/typecheck."
---

# Task

Carry a development task from request to verified result. Default to **agents** so
each phase runs in an isolated context and the main thread stays clean. The user's
request is everything after `/task` (or the task they described in their own words).

## Phases

Run in order. Each phase typically delegates to one or more subagents.

### 0. Triage (always, fast)

- Restate the task in one line. Identify scope: single-file tweak vs. multi-file feature.
- **Classify the work: build (new behavior) or bug (existing behavior is wrong).** The
  phases below are identical for both — a bug only shifts the emphasis: reproduce and
  pin the root cause before touching code, fix the cause not the symptom, and leave a
  regression test behind. Note the classification so the later phases pick the right slant.
- **If requirements are genuinely unclear or contradictory** — not just "could use a
  default" — run the **grill-me** skill to interrogate the request before building.
  Skip grilling for clear or low-stakes tasks; pick sensible defaults and note them.
- **If the task needs external or unfamiliar knowledge** (a library's real API, a
  spec, a design decision to vet, a claim to verify) — run the **research** skill (or
  `/research`) and fold its conclusion into the plan. Skip when the codebase already
  answers it.

### 1. Plan (SKIPPABLE)

- Skip for small, obvious, bounded edits — go straight to Implement.
- Otherwise spawn a planning agent (architect/Plan-style) to read the relevant code
  and return a concrete step-by-step plan: files to touch, order, edge cases, risks.
- **For a bug, the plan is a diagnosis first.** Have the agent reproduce the failure
  (or define the exact repro steps), trace it to a root cause, and only then propose the
  fix — name the cause, not just the line to change. Don't skip this phase for bugs
  unless the cause is already obvious and confirmed.
- For an open-ended or multi-approach problem, have the agent compare options and
  recommend one. Surface the plan to the user before large or irreversible work.

### 2. Implement

- Delegate the build to subagent(s). Prefer one agent per independent slice so they
  run concurrently and don't share context — split by file/module/feature boundary,
  not arbitrarily.
- For surgical 1–2 file edits, a single focused builder agent (or doing it inline) is
  fine. For 3+ file or cross-cutting work, fan out and have each agent own a slice.
- Match the surrounding code: naming, comment density, idioms, existing conventions.
- **For a bug, fix the root cause, not the symptom**, and add a regression test that
  fails before the fix and passes after — unless the project has no test surface for it.
- If agents mutate overlapping files in parallel, isolate them (separate worktrees)
  to avoid conflicts.

### 3. QA

- Spawn a reviewer agent to audit the diff for correctness bugs, missed edge cases,
  and convention violations — one line per finding, severity-tagged, no praise.
- Run the project's checks: build, typecheck, lint, tests — whatever exists. Fix what
  they surface (loop back to Implement if needed). Report failures honestly with output.
- For behavioral changes, verify by actually running the relevant path when feasible,
  not just by static review.
- **For a bug, confirm the original repro no longer fails** — re-run the exact steps (or
  the regression test) that exposed it, not just the happy path.

## Follow-up: harness-engineering docs + checks

After the task is done and verified, if the project carries **harness-engineering
guidance** — agent-facing docs that future agents rely on (e.g. `AGENTS.md`,
`CLAUDE.md`, `docs/coding-rule.md`, per-folder ownership notes, doc-update policies) —
do the maintenance pass:

1. **Update docs.** If the work introduced something durable a future agent won't see
   from code or git alone — a new convention/constraint, a non-obvious decision, a
   migration/rename, a gotcha, or a self-correction after build/human feedback —
   record it in the nearest agent-facing doc. Skip routine edits and anything already
   documented. If the project ships a doc-refresh/doc-update skill, prefer it.
2. **Run lint + typecheck** (and the project's other quality gates) as the final gate,
   using the project's own commands. Fix anything they flag before declaring done.

Skip this follow-up entirely for projects with no such agent-facing guidance.

## Guardrails

- Agent-first, but don't over-delegate trivial one-liners — judgment over ceremony.
- Confirm before irreversible or outward-facing actions; approval in one phase doesn't
  carry to the next.
- Don't commit or push unless the user asks.
- Report outcomes plainly: if checks fail, say so with output; if a phase was skipped,
  say which and why.
