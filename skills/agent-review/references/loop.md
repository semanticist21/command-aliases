# Review loop

Use `$agent-review` as the review engine. This skill adds a repeatable
implementation loop and a stricter pre-fix consensus gate; it does not change
the base `agent-review` skill.

Every `$agent-review` invocation made by this wrapper is discovery-only. Do
not apply the base skill's implementation findings before this loop's
unanimity gate; the loop itself is the only authority that may edit the task.

## Cycle

1. Build the evidence packet required by `$agent-review`: the verbatim request,
   applicable instructions, relied-on materials, changed artifacts or diff,
   commands and test/runtime output, observations, decisions, assumptions, and
   unresolved constraints. Before sharing it, redact or placeholder-substitute
   secrets, credentials, tokens, private paths, account identifiers, and other
   internal details. Keep raw sensitive evidence coordinator-only and never
   copy it into a reviewer or user-facing report.
2. Assign a stable item ID when a finding is first discovered, using its
   normalized issue kind, subject, and location, and carry that ID through
   retries and the pending queue. At the start of each cycle, promote every
   queued item into the candidate pool. Remove it only after it is included in
   the next frozen candidate set or receives an explicit reviewed disposition
   such as duplicate, invalid, or rejected with a short reason; never drop it
   silently.
3. Run the normal `$agent-review` two-round protocol with 2–4 independent,
   read-only reviewers. Keep distinct semantic, correctness, and verification
   lenses when the risk warrants them.
4. Normalize the round-one results into atomic candidate items. Preserve the
   evidence internally even though the final user-facing report may summarize
   excluded items.
5. Before changing anything, run `$agent-review` again over the complete
   candidate set as one batch. Freeze that candidate set before the gate
   starts. Treat the gate as closed-world: reviewers vote only on the frozen
   items, and any newly discovered issue is recorded separately in the
   next-cycle queue rather than merged into the current vote or edit batch.
6. A candidate is actionable only when every assigned reviewer marks it
   `accept`. Majority acceptance, non-blocking dissent, `reject`, or `defer`
   is not enough. Apply every unanimously accepted item, regardless of
   severity, then rerun the checks affected by those edits.
7. Start the next cycle with the updated evidence, including verification
   failures and newly queued items.

## Counters and termination

Track these counters for the current state:

- `findings`: unanimously accepted actionable items still requiring a change.
- `unresolved`: unanimously accepted items not yet fixed and verified.
- `fix targets`: accepted items waiting to be applied.
- `pending queue`: new out-of-set discoveries waiting for the next cycle.

Finish successfully only when all four counters are zero. A non-consensus
item is excluded from these counters and from implementation, but report its
count, status, and a short reason in the final summary. Do not silently turn a
dissent into a fix or call an unverified fix resolved. Check this terminal
condition before stall handling; excluded-only items never prevent success.

## Stalled cycles

Use a stable item ID formed from the SHA-256 of the normalized issue kind,
subject, and location; normalize whitespace, line endings, and task-root-
relative paths, and exclude mutable recommendation wording. Serialize each item as the sorted
tuple `(id, severity, status, location, recommendation, evidence_digest)`;
normalize whitespace and line endings, task-root-relative paths, and list
ordering before hashing `evidence_digest`. Include only artifacts, commands,
and checks explicitly named by an item or changed by its fix. Reduce each
verification result to `pass`, `fail`, or `blocked`, omitting timestamps,
logs, and other volatile text. A pending queue change is material only when
an item enters or leaves the set, or its normalized state changes; reordering
is not a change. Excluded items are reported but are not part of stall state.

A cycle has progress only when an item moves toward verified resolution
(`accepted` → `applied` → `verified`), a queued item enters the frozen
candidate set or receives a reviewed disposition, or a relevant verification
outcome improves from `fail`/`blocked` to `pass`.
Formatting, unrelated file churn, and volatile output changes are not
progress. If a non-terminal normalized state has no progress for two
consecutive cycles, stop as a blocker rather than claiming success. Report
the repeated state, remaining actionable or unresolved items, and the
external decision needed. Do not impose an arbitrary maximum iteration count.

Create no process ledger or handoff file.
