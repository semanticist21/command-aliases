---
name: analysis
description: "Root-cause unclear bugs, flaky failures, regressions, or why-failing asks."
---
# Root Cause Hunt

Find the *real* cause of a bug — not the first plausible one. Single-line reasoning
goes wrong on subtle bugs (races, stale cache, off-by-one, wrong layer). This skill
fans out independent investigators, then adversarially cross-checks each hypothesis
before committing to a verdict.

Core principle: **a hypothesis is not the cause until an independent agent tried to
refute it and failed.** Confirmation bias is the enemy.

## When to use

- Symptom clear, cause unclear. Multiple competing hypotheses. High cost of guessing wrong.
- Intermittent / flaky / race / regression / "works locally fails in CI" bugs.
- Skip for: one-line stack-trace reads, obvious typos, syntax errors the compiler names.
- **Gate before fan-out:** if the cause is obvious from a single read, skip the whole hunt and just answer. Fan out only when one read won't settle it.

## Workflow

### 1. Lock the symptom (do this inline, fast)
Write down, in one place, before any investigation:
- **Observed:** exact failing behavior + error text verbatim (quote it, don't paraphrase).
- **Expected:** what should happen.
- **Repro:** exact steps / command / input. If not reproducible, say so — that itself is a clue.
- **Scope:** when did it start? which commit/version/env? what changed?
- **Blast radius:** always-fails vs sometimes vs one-user-only.

If repro or error text is missing, ask the user for it now. Do not investigate blind.

### 2. Fan out investigators (parallel sub-agents)
Spawn 3–5 **independent** read-only investigator agents concurrently. Each gets the
locked symptom + ONE distinct angle. Tell each: *return ranked hypotheses with
file:line evidence, no fixes yet.* Angles to assign:

- **Data-flow trace** — follow the bad value backward from the failure point to its source.
- **Recent-change** — `git log`/`git blame` the failing region; what diff correlates with the symptom onset?
- **Boundary/contract** — types, null/empty, off-by-one, encoding, timezone, locale, units, async ordering.
- **State/lifecycle** — cache, stale read, init order, shared mutable state, race/concurrency.
- **Environment/config** — env vars, versions, build flags, feature flags, deploy diffs.
- **External/integration boundary** — third-party API contract change, network, DB/driver behavior, version skew across a service boundary (distinct from local config).

Pick the angles that fit the bug; drop irrelevant ones. Each investigator works blind to
the others — diversity is the point. (If your platform lacks parallel sub-agents, run
the angles sequentially but keep each pass independent — don't let one bias the next.)

### 3. Collate + dedup hypotheses
Merge all returned hypotheses into one ranked list. Dedup by (file, mechanism). For each:
`hypothesis · mechanism · supporting evidence (file:line) · how to confirm/refute`.
Drop pure speculation — but KEEP a low-evidence hypothesis if it is the only one that
explains the intermittency or the full symptom set. The true cause of a hard bug often
has weak initial evidence; that's why it's hard. Don't reward easy-to-evidence symptoms.

### 4. Adversarial cross-validation (the critical step)
For each surviving hypothesis, spawn a **skeptic** agent whose job is to REFUTE it.
Give the skeptic the FULL ranked list (not just its target H) so it can argue a rival
explains the symptom better. Prompt: *"Here is a claimed root cause: <H>, among these
rivals: <list>. Find evidence H is NOT the cause. Look specifically at code the original
investigator did NOT cite — untouched files, alternative mechanisms. Default to 'not the
cause' unless the code forces otherwise. Check: does the timeline fit? does it explain
ALL symptoms incl. the intermittency? would this mechanism produce this exact error?
Return at least one concrete check you actually ran — not just 'couldn't refute'."*

Run skeptics concurrently. A hypothesis survives only if the skeptic ran a real check
and still failed to refute it (a lazy "looks fine" is not survival).
For the top candidate, demand a **causal chain**: every link from root cause → observed
symptom must be backed by code, not hand-waving. A gap in the chain = not proven.

### 5. Confirm by prediction
The real cause makes *testable predictions*. Before declaring victory, state one:
"if this is the cause, then changing X / logging Y / this other input should do Z."
Verify it — run the minimal experiment, add a probe, check the predicted log line.
A cause that explains the past but predicts nothing is a guess.

**If you can't run the experiment** (prod-only, no exec, read-only review): state the
prediction as a falsifiable claim for the user to verify, and downgrade confidence —
never declare high confidence on an unrun prediction.

### 6. Verdict
Report:
- **Root cause** — one sentence, file:line.
- **Causal chain** — root → symptom, each link cited.
- **Why not the others** — one line each on refuted hypotheses (so the user trusts the elimination).
- **Confidence** — high/medium/low + what would raise it.
- **Fix direction** — pointer, not a full patch unless asked. Note blast radius / regression risk.

## Guardrails
- Investigators and skeptics are **read-only**. No edits during the hunt — diagnosis first.
- Quote error text and code exactly; never paraphrase an error into a different meaning.
- "Reproduced once" ≠ understood. Intermittent bug isn't solved until the mechanism explains the intermittency.
- If after cross-validation two hypotheses both survive, say so — report both, don't force a single answer.
- No silent caps: if you limited investigator count or skipped an angle, say which and why.
- Don't fix the symptom (retry/sleep/try-catch swallow) when the cause is unknown — that hides the bug.
