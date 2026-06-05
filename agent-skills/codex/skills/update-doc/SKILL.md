---
name: update-doc
description: "Update a project's documentation to match its current code, scoped to that project's own harness/doc structure. Given instructions, apply exactly that doc change in the right doc home; given no instructions, audit every durable doc against the real code and reconcile drift. Use when the user asks to /update-doc, update/refresh/현행화/sync the docs, fix stale docs, or bring documentation in line with the code. For AGENTS.md-only work prefer update-agents-md; for a trivial one-line typo/word fix just edit directly without this workflow."
---

# Update Doc

Keep a project's durable docs accurate and in the right place by following that
project's *own* documentation harness, not a fixed layout — so step 1 is always
discovering where this project keeps docs and what the rules are.

## Scope

In: durable Markdown/text docs — `README*`, `doc/`/`docs/`, `*/doc/` recovery notes,
architecture/handoff notes, doc comments that state contracts. **Read** `AGENTS.md`
and `CLAUDE.md` for the harness contract, but **don't edit** AGENTS.md here — that's
`update-agents-md`'s job; route AGENTS.md hygiene/edits there to avoid colliding
rules (line caps, scoped ownership). Out: code logic changes, generated output
(`dist/`, build artifacts), dependency files, and pure session/status logs unless
the harness explicitly hosts a status doc.

## Workflow

1. **Find the root + harness rules.**
   - Root: `git rev-parse --show-toplevel`, else cwd. Honor a worktree env var if set.
   - Read the root agent doc first (`CLAUDE.md` and/or `AGENTS.md`) and any nested
     `AGENTS.md`. These define the *documentation contract*: which doc owns what
     (e.g. `doc/` for cross-folder architecture, `<folder>/doc/` for recovery notes,
     `AGENTS.md` for reusable gotchas, source comments for fragile local logic),
     plus lint/test/harness commands and ownership boundaries. Obey it over any
     default in this skill. In **directed mode** (next step) you only need the
     contract for *where the named doc lives* — skip the full nested sweep.
   - Note doc-specific helper skills/commands the harness defines (e.g. doc-add,
     doc-update-status) and prefer routing through them when they fit.

2. **Determine mode from the instruction.**
   - **Directed** — the user named a doc, fact, or change ("update the API doc",
     "rename X in the README"): make exactly that change, in the doc the harness
     says owns it. Don't sweep unrelated files.
   - **Currency audit (no instruction / "현행화" / "check all docs")** — enumerate
     durable docs and verify each against the real code. Concrete enumeration:
     `rg --files -g 'README*' -g 'doc/**' -g 'docs/**' -g '*/doc/**' -g '*.md'`
     from the root, minus generated/vendored dirs, minus AGENTS.md (sibling owns).

3. **Audit against code (currency mode).** For each doc, spot claims that are cheap
   to verify and likely to drift, then check them against the source:
   - Commands / scripts (`make`, package scripts, CLI flags) — do they still exist?
   - Paths, filenames, module/folder names, ports, env var names.
   - Architecture/behavior contracts — does the code still do what the doc says?
   - Scope/boundary statements vs. what's actually implemented.
   - Use `rg`/file reads to confirm before editing. Don't rewrite from memory.

4. **Reconcile drift.** Fix stale/incorrect text in place. Put each fact in the doc
   the harness assigns it; move it if it's in the wrong home rather than duplicating.
   Tighten verbose passages without losing operational meaning. Delete guidance that
   another canonical doc now owns. Keep edits ASCII unless the file already uses
   non-ASCII. Do not invent new sections beyond what's needed to fix drift.

5. **Don't add noise.** No timestamp-only history, status logs, redundant
   corrections, secrets, or raw logs in durable docs. Add conversation-learned
   context only when it's durable, repo-scoped, and future-useful.

6. **Verify.** Re-read changed sections. Re-confirm any path/command you cited
   exists. Run the narrowest doc/lint/harness check the project defines (e.g. a repo
   harness script) when one is cheap to run.

7. **Report.** Short numbered list: which docs changed and the drift each fix
   resolved. If nothing was stale, say so explicitly per doc area rather than a vague
   "looks fine".

## Guardrails

- Edit only docs in the named scope (directed mode) or the durable-doc set (audit
  mode). Don't touch code to make a doc "true" unless the user asked for a code fix.
- When a claim is ambiguous and you can't verify it cheaply, flag it in the report
  instead of guessing.
