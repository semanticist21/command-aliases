---
name: agent-review
description: Review the current task with independent agents.
---

# Agent review

Give reviewers the verbatim request, instructions, and actual diff. Assign 1–4 independent, read-only reviewers in proportion to risk, complexity, changed surface, and verification difficulty; use distinct semantic, correctness, and verification lenses when useful.

Run two rounds. In round one, each reviewer submits atomic items with the problem, impact/severity, concrete evidence (request, file/diff, test, or runtime result), and recommended action. Merge duplicates without dropping distinct evidence. In round two, give every reviewer every merged item without its author or prior votes. First, each reviewer marks it accept, reject, or defer and explains why; reject and defer are dissent. Then reveal dissent rationales without authorship so the other reviewers can judge each one as concrete and relevant, evidence-backed, or non-blocking.

Confirm an item when every reviewer accepts it. Otherwise, confirm it only when a strict majority of all assigned reviewers accepts it and every dissent is non-blocking: it must not specifically and relevantly, with evidence, refute the item's premise, impact, or recommendation. Do not discard a dissent by coordinator judgment: its non-blocking status requires unanimous agreement from the other reviewers. A concrete, relevant, evidence-backed dissent—or disagreement about whether it meets that bar—defers the item for report rather than confirmation. Do not shrink the denominator for abstentions or non-blocking dissent. With one reviewer, run both rounds but label the result as a single reviewer's judgment, not consensus.

For an implementation task, apply confirmed high/medium findings and rerun affected checks; for a review-only request, report confirmed and deferred items without editing. Create no process ledger.
