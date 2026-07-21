---
name: harness-doc
description: "Manage project agent harness docs — add, update, polish, setup, or audit AGENTS.md/docs/ hierarchy. Usage: harness-doc [scope] [request]. Scope omitted → ask user."
---

# Harness Doc

Manage a project's agent-facing documentation harness: the layered `AGENTS.md` / `docs/` / folder-local `AGENTS.md` structure that lets future agents read project rules, ownership, gotchas, and conventions without re-deriving them from code.

## Interface

```
harness-doc [scope] [request]
```

Scopes:
- `add` — Record a durable candidate (gotcha, decision, convention, ownership) from a user note or session finding into the nearest appropriate AGENTS.md/docs file.
- `update` — Audit and refresh existing docs against the live repository; remove stale references, sync renamed/moved files, compact drifted content. (Absorbs former `update-doc` / `doc-update` / `project-doc-refresh` / `update-agents-md`.)
- `polish` — Consolidate, de-duplicate, and compact harness docs through edit-review cycles. (Absorbs `doc-polish`.)
- `setup` — Bootstrap a project's harness architecture: layered AGENTS.md, root CLAUDE.md, docs/ ownership map, coding-rule reference, harness guards. (Absorbs `doc-setup` + `harness-setup`.)
- `audit` — Read-only survey of the current harness: report coverage gaps, drift, stale docs, oversized files, missing folder-local AGENTS.md.

If scope is omitted, present the user with the scope choices and wait.

## Workflow

1. **Resolve scope.** If `scope` arg is missing, ask the user to pick `add | update | polish | setup | audit`. If `request` is missing, ask what the request is.
2. **Discover the harness.** Read root `AGENTS.md` (or `CLAUDE.md` symlink). Follow its docs index to `docs/README.md` and the ownership map. Identify folder-local `AGENTS.md` files. If no harness exists and scope != `setup`, stop and suggest `harness-doc setup`.
3. **Act per scope** (sections below).
4. **Verify** — re-read changed files; ensure cross-references resolve; run any repo lint (biome, prettier, markdownlint) if configured.
5. **Report** — one-line summary of what changed and where.

## add

Record a durable candidate from a user-provided note or a session finding. The note is the source of truth: preserve exact paths, identifiers, commands, constraints; rephrase only enough to make it compact.

- Qualifying candidates (only these reach AGENTS.md):
  - Self-correction after human/build feedback.
  - Explicit user directive or correction intended to govern future work.
  - New convention, constraint, or ownership boundary.
  - Non-obvious decision (chose A over B for reason X).
  - Migration or rename affecting how the folder is read.
  - Gotcha / footgun discovered.
- Do NOT log routine edits, diff-obvious fixes/refactors, or documented facts.
- Route by scope:
  - Subtree-specific (rule, quirk, ownership, gotcha) → folder-local `AGENTS.md`.
  - Project-wide repeatable trap or lesson → root `AGENTS.md` or `docs/playbooks/`.
  - Project-wide operating rule → root `AGENTS.md` or `docs/coding-rule.md`.
- Append a concise bullet under the relevant heading. Match existing convention. Do not rewrite unrelated content.

## update

Refresh existing docs against the live repo. Triggered when the user says "현행화", "doc sync", "stale docs", or `/update-doc`.

- Audit `docs/` and `AGENTS.md` files for:
  - Stale references to renamed/moved/deleted files.
  - Command lists that no longer match `package.json` scripts.
  - Architecture notes that contradict current code shape.
  - Oversized files (>500 lines) that should be split.
  - Missing folder-local `AGENTS.md` for folders with non-obvious constraints.
- Fix drift, remove legacy content, compact verbose guidance to only what future agents need.
- Preserve durable guidance; only remove what is demonstrably stale.

## polish

Consolidate and compact harness docs through edit-review cycles. Triggered when docs grew organically and need de-duplication.

- Find duplicated guidance across `AGENTS.md`, `docs/`, folder-local `AGENTS.md`.
- Merge into a single canonical source; replace other mentions with a one-line cross-reference.
- Compact verbose sections without losing durable substance.
- Re-run after each pass; stop when no further de-duplication possible.

## setup

Bootstrap a project's harness architecture. Idempotent — safe to re-run on an existing harness (will fill gaps, not overwrite).

- **Root `AGENTS.md`** — project purpose, layout, commands, conventions, doc policy. Keep under 150 lines; link to `docs/` for detail.
- **`CLAUDE.md`** — symlink to `AGENTS.md` (Claude discovery).
- **`docs/README.md`** — docs index with ownership map.
- **`docs/coding-rule.md`** — project coding rules. See `references/coding-rule.md` for the canonical seed (file size 200-500 lines, agent readability, etc.).
- **`docs/templates/AGENTS.md.template`** — folder-local template.
- **Folder-local `AGENTS.md`** — only for folders with non-obvious constraints. Format: `## Purpose` (1-2 lines) + `## Notes` (bullets). Keep 10-30 lines total.
- **Harness guards** (optional, ask user):
  - Pre-commit/pre-push hook that runs changed-file guard + test/doc nudges.
  - Script: `scripts/agent-harness-check.mjs` with policy in `harness.config.json`.
- **External best practices**: see `references/external-best-practices.md` for distilled guidance from Karpathy / Anthropic / OpenAI to draw on when shaping the harness.

After setup, report what was created and what the user should fill in.

## audit

Read-only survey. Report:
- Coverage: which source folders lack `AGENTS.md` despite non-obvious constraints.
- Drift: stale references, outdated commands, contradictory guidance.
- Size: files over 500 lines that should split; files under 10 lines that may not justify their own doc.
- Duplication: same guidance repeated across docs.
- Missing: coding-rule, doc index, templates, harness guards.

Do not modify anything. Output a ranked list of findings.

## File size and structure rules

Apply across all harness docs and project source files:

- **Target file size: 200-500 lines** for source files (frontend and backend alike). Agents read, navigate, and manage smaller files more reliably; context stays focused.
- **Under 200** — likely fine if cohesive; too small may indicate premature splitting.
- **Over 500** — split by responsibility (route, feature, layer). Agents lose context tracking in large files.
- **AGENTS.md files** — root under 150 lines, folder-local under 30 lines. These are indexes, not manuals.
- **One responsibility per file** — agents grep for a symbol or rule and want the whole answer in one place.

## Doc update policy

Two tracks run in parallel:

- **Track 1 — inline.** Record a durable candidate with `harness-doc add` as soon as it passes the evidence gate. At every coding-task handoff, audit changes and user corrections for omissions.
- **Track 2 — periodic sweep.** Run `harness-doc polish` before a PR and after touching 5+ files or moving structure.

## References

- `references/coding-rule.md` — canonical coding-rule seed (file size, readability, structure).
- `references/external-best-practices.md` — distilled harness best practices from Karpathy / Anthropic / OpenAI.
- `references/AGENTS.md.template` — folder-local AGENTS.md template.

## Anti-patterns

- Do not infer project lore from code shape, UI copy, or agent interpretation. Record only what the user explicitly provides or what is demonstrably true from code.
- Do not create documentation files preemptively. Each doc must justify its maintenance cost.
- Do not duplicate guidance across docs — cross-reference instead.
- Do not block on a missing harness when the user's request is a single-file edit; nudge toward `setup` only when the doc surface is actually needed.