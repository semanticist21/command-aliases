---
name: "doc-polish"
description: "Consolidate, correct, de-duplicate, and compact repo harness docs and LLM memory stores against the live repo through edit-review cycles."
---
# Doc Polish

Use for existing agent harness docs (`AGENTS.md`, `CLAUDE.md`, `.agents/`, runtime rules) or LLM memory stores; not general product/API docs, release notes, or status updates. Creating a structure is `doc-setup`; adding one new note uses the project's doc-add flow.

## Scope and principles

- Default to the executing repository. Touch user-scope context only when explicitly requested; never infer a target outside the repo.
- Treat live code as truth. Keep concise, durable, actionable facts: commands, paths, ownership, safety, setup, and decisions.
- One canonical owner per subject; the most local governing doc wins unless root explicitly owns it. Preserve stricter local rules.
- Remove narration, duplicates, stale examples, vague reminders, resolved progress, and brittle history. Do not invent lore.
- Leave already concise, canonical, and current files unchanged.

## Workflow

1. Read root and governing nested instructions. Inventory target docs/store and map each file's scope, canonical subjects, duplicates, and possible dead owners.
2. Verify facts named in a document against the live repository before compacting. Resolve duplicated ownership before editing; ask when owners conflict or a move weakens a local rule.
3. Edit one document/entry at a time. Fold full rules into the canonical owner and replace proven duplicates with a short reference. Preserve safety, test, approval, secret, and ownership constraints.
4. Delete a whole file only when its governed folder/feature or every fact is proven gone (not moved); relocate remaining live rules first. Never delete merely for age or length.
5. For memory, read the complete index and entries first; preserve its native shape, keep index pointers valid, merge overlaps, and retain a short why/how when it changes future behavior.
6. Review BEFORE versus AFTER independently after each changed file (`git show HEAD:<path>` or a saved external copy). Check lost/weakened durable facts, stale paths, ownership conflicts, unclear routing, and remaining duplication. Fix findings and repeat to zero; report a judgment blocker rather than guessing.
7. Globally recheck canonical ownership, references, and the repository's narrow doc check (or `git diff --check`).

## Guardrails and output

- Do not change application code unless explicitly asked. Do not merge genuinely runtime-specific rules.
- Never broaden secrets, credentials, private paths, or internal implementation details.
- Report changed/skipped/deleted files, reason, verification, review rounds/final findings, line deltas, and unresolved questions.
