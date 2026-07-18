---
name: "agent-review"
description: "Review this session's changes with subagents for review, QA, or fix loops."
---
# Agent Review

Use independent reviewers to assess the current task's actual diff against the verbatim request and repository instructions. It is review/QA, not permission to self-certify or expand scope.

## Review loop

1. Freeze the review target: request, changed paths/diff, relevant instructions, tests run, and intended behavior. Exclude unrelated dirty work.
2. Assign independent read-only reviewers with complementary lenses (correctness/regression and security/architecture/UI as relevant). They must inspect code and evidence, not merely summarize the author.
3. Require severity-tagged findings with exact locations, failure scenario, evidence, and actionable remediation. Independently verify/refute P0–P2 findings before accepting them as blocking; drop refuted findings. Distinguish confirmed defects from optional suggestions.
4. Default is report-only: P0–P2/actionable findings block readiness but do not authorize edits. Fix/recheck only when user explicitly requests remediation; cap at three rounds and stop/escalate if findings do not decrease or a product/authority blocker remains.
5. Do not count duplicated reviewers, an author pass, unavailable reviewers, or “no time” as independent QA. For a required two-reviewer policy, unavailable review blocks completion.

## Output

Report reviewer count/lenses, findings and resolutions, recheck count, verification, residual risks, and final status. Never claim zero findings beyond the reviewed scope.
