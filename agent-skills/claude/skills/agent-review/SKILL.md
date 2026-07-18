---
name: "agent-review"
description: "Review this session's changes with subagents for review, QA, or fix loops."
---
# Agent Review

Review the current session’s work against the verbatim user request, not merely the final diff. Use independent reviewers for meaningful changes.

## Scope first

Read the request/clarifications, session actions, current and staged diffs, untracked files, test output, repository instructions, and relevant surrounding code. Git metadata corroborates scope but does not replace session context. State what is in/out of review.

## Review loop

1. Delegate focused, read-only reviews with distinct lenses (correctness/security, behavior/regression, tests/UI/docs) and the exact success criteria. Avoid duplicate broad prompts.
2. Require evidence: file/line, failure path, impact, and a concrete fix. Dedupe false positives and rank critical/high/medium/low.
3. Default is report-only: do not edit. Run fixes and re-review only when user explicitly requests remediation/convergence; cap that loop at three rounds and report unresolved or cap-hit findings.
4. If reviewers are unavailable, say QA is blocked; self-review is not equivalent when independent review is required.

## Report

Include rounds/reviewer count, scope, findings by severity, fixes, verification, remaining risks, and a verdict: clean, clean with accepted risk, or not ready. Never claim zero findings by weakening constraints or excluding changed code without saying so.
