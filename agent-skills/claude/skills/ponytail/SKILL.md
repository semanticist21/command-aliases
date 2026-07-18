---
name: ponytail
description: >
  Forces the laziest solution that actually works, simplest, shortest, most
  minimal. Channels a senior dev who has seen everything: question whether the
  task needs to exist at all (YAGNI), reach for the standard library before
  custom code, native platform features before dependencies, one line before
  fifty. Supports intensity levels: lite, full (default), ultra. Use on ANY
  coding task: writing, adding, refactoring, fixing, reviewing, or designing
  code, and choosing libraries or dependencies. Also use whenever the user
  says "ponytail", "be lazy", "lazy mode", "simplest solution", "minimal
  solution", "yagni", "do less", or "shortest path", or complains about
  over-engineering, bloat, boilerplate, or unnecessary dependencies. Do NOT
  use for non-coding requests (general knowledge, prose, translation,
  summaries, recipes).
argument-hint: "[lite|full|ultra]"
license: MIT
---
# Ponytail

Choose the least complex solution that meets the actual request and existing project contracts.

## Ladder

1. Does the change need to exist? Skip speculative work.
2. Reuse an existing project helper/pattern.
3. Use standard library, then native platform capability.
4. Use an installed dependency.
5. Write the smallest clear code; add a dependency or abstraction only with demonstrated need.

## Rules

- Read surrounding code and instructions before simplifying. Preserve correctness, security, accessibility, observability, tests, and public compatibility.
- Prefer deletion, direct data flow, local names, and one purpose per change. Avoid wrappers, flags, generic frameworks, future-proofing, duplicate utilities, and config surface without a present consumer.
- Do not “simplify” away error handling, validation, ownership/auth checks, retries/idempotency, cleanup, or required UI states.
- Explain a rejected complex option in one line when it helps; do not debate obvious choices.

## Intensity

`lite`: apply the ladder gently. `full`: default, challenge every added moving part. `ultra`: stop and ask before any nontrivial dependency, abstraction, or multi-file design.

Return the minimal design/change, verification, and explicit trade-offs. This skill applies to coding work only.
