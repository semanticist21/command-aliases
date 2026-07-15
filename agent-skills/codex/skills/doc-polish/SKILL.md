---
name: "doc-polish"
description: "Consolidate, correct, de-duplicate, and compact repo harness docs and LLM memory stores against the live repo through edit-review cycles."
---
# Doc Polish

Compact, de-duplicate, and de-stale a project's agent-facing context — repo harness
docs and LLM memory stores — so future Claude Code or Codex sessions load them with
less context cost and fewer contradictions.

Use this skill when the user asks to compact, polish, compress, prune, de-dupe,
correct, refresh (현행화), or clean up either target:
- **Harness docs** — repo-local agent rules: `AGENTS.md`, `CLAUDE.md`, `.agents/`,
  `.codex/`, `.claude/`, `harness.config.json`, or handoff docs that define agent
  operating rules.
- **Memory stores** — agent-managed note stores: an index-plus-one-fact-per-file
  memory dir (an index like `MEMORY.md` plus memory files with frontmatter), a
  running memo file (`memo.md`), or similar.

Do not use it for general product docs, API docs, release notes, or status updates
unless the user explicitly folds them into scope.

This is the one **maintenance** skill for an existing doc/memory set: it consolidates
duplicates, corrects stale or wrong facts against the live repo, compacts, cleans
memory stores, and runs the before/after review loop. Correcting and refreshing
(현행화) are part of the job, not a separate skill. Route only these elsewhere:
- Creating a doc structure from scratch → `doc-setup`.
- Adding one brand-new note → the project's doc-add flow.

## Scope

Default to the **executing project**: the repo you are running in
(`git rev-parse --show-toplevel`), its harness docs, and any project-local memory
store. Operate on **user-scope** context (`~/.claude/...`, `~/.codex/...`,
cross-project memo files) only when the user explicitly asks — a request to "clean
up my memory" or naming a user-scope path *is* that explicit ask. Never silently
reach outside the current repo.

## Principles (why compact at all)

Durable docs and memory are the standing prompt every future session pays for in
context. Treat the context window as scarce RAM (context-engineering practice):
every token in a durable file competes with the task's own tokens. Optimize for:
- **Signal density.** One durable fact per line. No narration, no restating the
  obvious, no history unless it changes future behavior.
- **Single source of truth.** Each subject has exactly one canonical owner; other
  mentions are short references, not copies.
- **Locality.** Facts live in the nearest file that governs them.
- **Freshness.** A stale rule is worse than no rule — verify against the live repo;
  drop or fix what no longer holds.
- **Right altitude.** Keep rules specific enough to act on, general enough not to
  break on the next change. Cut brittle detail; keep the durable constraint.
- **Retrieval shape.** Headings and trigger wording let an agent find the right
  section without rereading the whole store.

A file that is already concise, canonical, fresh, and non-duplicative should be left
unchanged and reported as skipped.

## Workflow — harness docs

1. **Map the repo.**
   - Resolve the repo root with `git rev-parse --show-toplevel`.
   - Read root `AGENTS.md` and/or `CLAUDE.md` first, then any nested `AGENTS.md`
     that governs the harness docs being edited.
   - Inventory harness docs with `rg --files` before editing. Include obvious agent
     runtime folders and harness config, but exclude generated/vendor/build output.
   - Build a short index: document path, owner/scope, canonical subjects, and
     duplicate subjects found elsewhere.

2. **Choose document order.**
   - For each duplicated subject, identify the canonical owner first: the most local
     applicable doc wins unless a root doc explicitly owns that policy.
   - Move or preserve the full rule in that canonical owner, then replace other
     copies with short references only when the owner is unambiguous.
   - If two docs both claim ownership, or if moving a rule would weaken a local
     constraint, stop and ask instead of choosing a winner.

3. **Consolidate and correct one document at a time.**
   - Treat the live repo as source of truth: fix stale or wrong facts — commands,
     paths, APIs, versions, ownership — that no longer match the code. Correcting a
     wrong rule outranks compacting it; never compact a fact you have not verified.
   - Keep facts that affect future agent behavior: commands, file paths, review
     rules, safety constraints, hidden setup requirements, and durable decisions.
   - Remove redundant restatements, obsolete narration, repeated examples, vague
     reminders, and long explanations that do not change agent behavior.
   - Preserve stricter local rules. Do not weaken safety, test, doc, secret,
     approval, or ownership constraints.
   - Keep trigger wording and headings clear enough that Claude Code and Codex can
     route future work without rereading the whole repo.
   - Do not invent new project lore or infer history from code shape. If a fact is
     ambiguous, report it instead of encoding it.

4. **Run the per-document review loop as a before/after comparison.**
   - After editing each document, run an independent review that compares the BEFORE
     and AFTER side by side — not the AFTER in isolation. BEFORE comes from
     `git show HEAD:<path>` (or a saved pre-edit copy for files outside the repo);
     AFTER is the working-tree file. Use a review subagent when available, or a
     clearly separate review pass when the runtime has no subagent tool. Do not count
     the edit pass as review.
   - For any target not tracked by git (memory stores, out-of-repo harness docs),
     save a copy of the file before your first edit — that copy is the only BEFORE
     you will have.
   - Give the reviewer both versions and ask for severity-tagged findings on durable
     rules, commands, paths, ownership/safety constraints, and Why-trade-offs present
     in BEFORE but missing or weakened in AFTER; plus over-compression, unclear
     triggers, stale references, contradicted owner docs, and remaining redundant
     content. Judge compaction by whether every durable fact survived — never by a
     line-count target; report the delta, do not chase a number.
   - Fix confirmed findings, then review the same document again.
   - Repeat `edit -> before/after review` until the reviewer returns zero findings.
     If findings stop decreasing or require product/ownership judgment, stop and
     report the blocker instead of guessing.

5. **Global pass.**
   - Re-read the index after all per-document loops. Confirm every duplicated subject
     has exactly one canonical owner or an intentional short reference.
   - Search for broken references to renamed headings or moved docs.
   - Run the repo's narrow doc/harness check if one exists; otherwise run
     `git diff --check`.

6. **Report.**
   - List docs changed and the reason each changed.
   - List docs skipped because they were already optimized.
   - Report review convergence: rounds per changed doc, final findings count (zero
     unless a blocker was surfaced), and the before/after line-count delta.
   - Mention verification commands and any unresolved ownership questions.

## Workflow — memory stores

When the target is an LLM memory store, run the same edit–review discipline with
memory-specific rules:

1. **Read the whole store first** — the index and every fact file (or the full memo)
   before changing anything. Memory is written across many sessions; you cannot
   compact what you have not read. Memory stores are rarely git-tracked, so save a
   copy before your first edit (see the review loop's BEFORE requirement).
2. **Verify before trusting.** A memory reflects what was true when written. For any
   fact that names a file, function, flag, path, or command, confirm it still exists —
   in the executing repo for project memory, or in the project(s) a cross-project memo
   names. Fix drift; delete facts the live code proves wrong.
3. **De-duplicate and merge.** Fold overlapping facts into one entry. Keep the store's
   native shape (one fact per file, or one bullet per memo line); never let the index
   and the bodies diverge.
4. **Compact each entry** to the durable claim plus, for guidance-type notes, a short
   why / how-to-apply. Drop transient progress, resolved TODOs, and vague reminders.
5. **Keep the index one line per memory** — title, pointer, one-line hook. Never put
   memory body text in the index. Repair broken links between index and files.
6. **Review and report** as in the harness-doc loop (before/after comparison, severity
   tags, converge to zero findings). Do not invent new lore; if a fact's source is
   ambiguous, surface it for the user instead of encoding or deleting it silently.

## Guardrails

- Do not touch application code unless the user explicitly asks for code changes.
- Do not delete rules just because they are verbose; preserve the behavior in shorter
  language.
- Do not delete a memory just because it is old; delete only what the live repo proves
  wrong, and merge the rest. When unsure whether a fact is stale, ask.
- Do not merge runtime-specific instructions when Claude Code and Codex genuinely need
  different wording or mechanisms.
- Do not compact secrets, credentials, or private machine paths into broader docs.
  Remove accidental secret-like material only after confirming it is not required
  harness context.
- Do not create a status log. This skill improves durable harness docs and memory only.
