---
name: "doc-polish"
description: "Consolidate, correct, de-duplicate, and compact repo or user-scope agent harness docs and LLM memory stores through edit-review cycles."
---
# Doc Polish

Use for existing agent harness docs (`AGENTS.md`, `CLAUDE.md`, `.agents/`, runtime rules) or LLM memory stores; not general product/API docs, release notes, or status updates. Creating a structure is `doc-setup`; adding one new note uses the project's doc-add flow.

## Target and scope

- Invocation shape: `doc-polish [repo|user] [scope ...]`. `root` and `global` mean `user`.
- Default target is `repo`: the executing repository's governing instructions, harness docs, and memory stores. Never infer user scope or another repository.
- Explicit `user` targets the active runtime's user instruction entry point (`~/.codex/AGENTS.md` or `~/.claude/CLAUDE.md`) and every local document it explicitly routes to, recursively including index-linked entries. Resolve symlinks and edit each canonical file once. Do not follow arbitrary web links, source-code paths, or paths mentioned only as examples.
- With no scope argument, inventory and polish the full selected target. Each scope argument restricts work to the matching path, subtree, index section, or named topic plus only the owner/index references needed to keep routing valid; it never broadens the selected target. Stop on an ambiguous or unreachable scope rather than guessing.
- Before editing, report the resolved target, seeds, reachable files, exclusions, and scope intersection. Files reached through an index remain in scope even when stored outside the runtime directory.

## Principles

- Treat live code/config and explicit user instructions as truth. Keep concise, durable, actionable facts: commands, paths, ownership, safety, setup, and decisions. Preserve conditions, exceptions, and runnable commands while shortening.
- One canonical owner per subject; the most local governing doc wins unless root explicitly owns it. Preserve stricter local and runtime-specific rules.
- Remove narration, duplicates, stale commands/paths/owners/versions, implied guarantees, vague reminders, resolved progress, and brittle history. Do not invent lore.
- Leave already concise, canonical, and current files unchanged.

## Workflow

1. Read root and governing nested instructions. Inventory the entire resolved target before edits; map each file's purpose, audience, scope, owner/source of truth, references, duplicates, and possible dead owners.
2. Verify facts named in a document against the live repository, runtime config, or authoritative source before compacting. Resolve duplicated ownership before editing; ask when owners conflict or a move weakens a local rule.
3. Edit one document/entry at a time. Fold full rules into the canonical owner and replace proven duplicates with a short reference. Preserve safety, test, approval, secret, and ownership constraints.
4. Delete a whole file only when its governed folder/feature or every fact is proven gone (not moved); relocate remaining live rules first. Never delete merely for age or length.
5. For memory, read the complete index and every reachable entry first; preserve its native shape, keep one fact per entry, make the index point rather than repeat, keep pointers valid, merge overlaps, retain source/date when useful, and retain a short why/how when it changes future behavior.
6. Review BEFORE versus AFTER independently after each changed file (`git show HEAD:<path>` or a saved external copy). Check accuracy, discoverability, actionability, lost/weakened durable facts, stale paths, ownership conflicts, unclear routing, and remaining duplication. Fix findings and repeat to zero; report a judgment blocker rather than guessing.
7. Globally recheck canonical ownership, references, scope containment, and the narrow doc check (or `git diff --check`).

## Guardrails and output

- Do not change application code unless explicitly asked. Do not merge genuinely runtime-specific rules.
- Never broaden secrets, credentials, private paths, or internal implementation details.
- Report changed/skipped/deleted files, reason, verification, review rounds/final findings, line deltas, resolved target/scope, and unresolved questions.
