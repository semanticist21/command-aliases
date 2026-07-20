---
name: research
description: "Cross-checked investigation of an open technical question with sources and adversarial review. Use for design decisions, library/service choice, 'how does X work', technology comparison. Not for: root-causing one specific bug (analysis), systemic codebase audit (audit), or single-diff review."
user-invocable: true
argument-hint: "<question + audience/version/success criteria>"
---
# Research

Produce an extensive, cross-checked investigation and return a short, decisive
conclusion. Depth is in the process; the delivered answer is compressed.

## Scope first

1. If the question is underspecified (no constraints, audience, version, or
   success criteria), ask 2-3 sharp clarifying questions before fanning out.
   Skip this only when the ask is already concrete.
2. State the question as a single falsifiable claim or decision to resolve.
   Everything downstream serves that statement.

## Fan out (breadth)

Gather from independent angles in parallel — never a single source:

- **Codebase**: relevant files, prior art, existing decisions in `AGENTS.md` /
  `docs/`. Use `Explore` / investigator subagents for local truth.
- **Web**: `WebSearch` + `WebFetch` for current docs, releases, benchmarks,
  changelogs, issues, RFCs. Prefer primary sources (official docs, source repos,
  specs) over blog summaries.
- **External tools/MCP**: pull live data when a connected source is authoritative.

Each angle is blind to the others by design. For heavy topics, run a fan-out (multi-modal
sweep → adversarial verify → synthesize); this skill is the lighter inline path.

## Cross-check (confidence)

- Every load-bearing claim needs ≥2 independent sources, or it ships flagged as
  unverified.
- For each key claim, spawn a skeptic prompted to **refute** it. Drop or
  downgrade claims that survive scrutiny weakly.
- Record version/date — "true as of X". Surface conflicts between sources rather
  than silently picking one.
- Note what you did NOT cover (modality not run, source paywalled, sample size).

## Deliver (compression)

Lead with the answer. Structure:

1. **Verdict** — 1-3 sentences. The decision/answer, stated plainly.
2. **Why** — the 3-5 load-bearing reasons, each with a citation.
3. **Trade-offs / caveats** — what would change the verdict; open risks.
4. **Sources** — links, each tagged primary/secondary and dated.

Cut everything that does not change the decision. No process narration in the
final answer. If evidence is genuinely split, say so and give the conditional
recommendation, not a non-answer.

## Guardrails

- Never present a single-source claim as settled.
- Distinguish what sources state from your inference.
- Match effort to the ask: quick check → few sources, single verify pass;
  "thorough" / "audit" → wide fan-out, 3-5 skeptic votes, synthesis stage.
