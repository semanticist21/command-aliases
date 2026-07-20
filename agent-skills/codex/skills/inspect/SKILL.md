---
name: "inspect"
description: "Investigation router and single entry point. Use when the right lens isn't obvious or you want one umbrella command. Reads the ask and dispatches to: audit (systemic codebase audit), analysis (one bug's root cause), or research (open technical question). For clear-cut cases, invoke the specific skill directly."
---
# Inspect (router)

Single entry point for investigation asks. Read the user's prompt and dispatch.

## Dispatch

1. **audit** — input names a surface (file path, module, feature, "this codebase", "what's wrong here", 점검/조사, 과잉 설계). Systemic multi-finding audit.
2. **analysis** — input names a specific failure (error text, failing test, repro, "flaky", "regression", "why is X failing"). Single bug root cause.
3. **research** — input asks an open question answerable from external sources ("how does", "compare", "should I use", "choose"). Cross-checked technical investigation.

If genuinely ambiguous, ask ONE clarifying question; do not pick blindly. After dispatch, the chosen skill owns the rest — do not shadow it with parallel investigation.

## Not for

- Single-diff review (code-review).
- Deleting unused code (dead-code-removal).
- Direct implementation (use task/microtask).

Thin router; substance lives in audit/analysis/research.
