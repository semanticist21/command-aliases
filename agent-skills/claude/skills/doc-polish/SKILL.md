---
name: "doc-polish"
description: "Consolidate, correct, de-duplicate, and compact repo harness docs and LLM memory stores against the live repo through edit-review cycles."
---
# Doc Polish

Bring agent-facing docs or durable memory stores into concise agreement with the live repository. Do not turn a documentation audit into product-code work.

1. Read repository instructions, ownership map, target docs, and the code/config/commands they describe. For a memory store, read its index and all linked facts first.
2. Establish each document’s purpose, audience, owner, and source of truth. Preserve local boundaries; move cross-cutting facts to the correct shared document rather than duplicating them.
3. Verify claims before retaining them. Remove stale commands, paths, owners, versions, and implied guarantees; never invent undocumented behavior or copy secrets/private infrastructure into broad docs.
4. Consolidate repeated rules, resolve contradictions in favor of the live repo/user instruction, shorten prose while preserving conditions, exceptions, safety constraints, and runnable commands.
5. Review each edit against before/after: accuracy, discoverability, actionability, scope, duplication, and unintended loss. Re-check links/references and required doc tooling.

Report changed docs, verified facts, removals/merges, checks, and unresolved ambiguity. Keep durable facts compact: one claim per entry, source/date when useful, and an index that points rather than repeats.
