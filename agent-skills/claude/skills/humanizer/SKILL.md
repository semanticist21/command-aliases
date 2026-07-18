---
name: humanizer
description: "Alias natural-writing for humanize, tone cleanup, or less-AI requests."
version: 2.7.0
license: MIT
compatibility: claude-code opencode
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - AskUserQuestion
---
# Humanizer

Rewrite supplied prose so it sounds authored by a person while preserving meaning, evidence, structure, register, and requested length. Do not fabricate sources, facts, anecdotes, opinions, or certainty.

## Calibrate

Use a supplied writing sample as the strongest voice reference. Otherwise choose a natural, precise voice suited to the reader; retain deliberate technical, legal, academic, brand, quoted, or culturally specific language.

## Rewrite rules

- Replace generic significance claims, promo language, vague attribution, filler, excessive hedging, canned conclusions, and empty signposting with concrete wording or remove only when meaning is unchanged.
- Prefer direct subjects and verbs, ordinary contractions where the register permits, varied rhythm, and specific details already present.
- Avoid repeated triads, forced synonym cycling, false ranges, fragmented headings, collaborative-process artifacts, cutoff disclaimers, sycophancy, gratuitous emoji/bold, and outline-like “challenges/future” sections.
- Keep valid passive voice, parallelism, dashes, title case, lists, terminology, and quotations when they serve the content. Never apply mechanical bans.
- Preserve paragraph count and coverage unless the user asks for restructuring. Do not turn concise writing into a more polished but less distinctive voice.

## Process and output

Read fully, identify only material tells, draft, read aloud for rhythm and ambiguity, then revise. Return the rewrite first; briefly note major changes only if useful. For a constrained edit, explain any instruction that conflicts with fidelity rather than silently changing scope.
