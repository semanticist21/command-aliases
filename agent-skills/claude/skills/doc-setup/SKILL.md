---
name: "doc-setup"
description: "Bootstrap a project's agent-facing documentation architecture — layered AGENTS.md, a root CLAUDE.md, a doc/ ownership map, and memory conventions."
---
# Doc Setup

Establish the documentation and context architecture a project needs so agents
(Claude Code, Codex) load the right rules at the right altitude — building from
scratch, or imposing structure on scattered docs.

Use this skill when the user asks to set up, scaffold, establish, or bootstrap agent
docs, an `AGENTS.md` structure, a documentation architecture, or says "there are no
docs yet."

Distinguish from siblings:
- `harness-setup` installs the *executable* safety harness (git guards, changed-file
  checks, test/doc nudges). doc-setup designs the *docs agents read*; hand the
  enforcement layer to `harness-setup`.
- `doc-polish` compacts an *existing* structure and cleans memory stores. doc-setup
  *creates* the structure that doc-polish later maintains.
- Once the structure exists, doc-add adds single notes and doc-update / `doc-polish`
  refresh docs against the repo.

## Principles

Design the doc set as a layered instruction system, not a pile of files. Same
context-engineering rules `doc-polish` enforces, applied at design time (context
window as scarce RAM: every durable token competes with the task):
- **Layered by scope.** Project-wide rules at the root; subtree rules in nested
  files; screen/module specs in their own docs. An agent reads root + nearest.
- **One canonical owner per subject.** Decide ownership up front so nothing is
  duplicated later.
- **Grounded in real repo facts.** Populate from verified commands, paths, and
  structure — never invented product lore or inferred history.
- **Right altitude, retrieval shape, signal density.** Specific enough to act on,
  general enough to survive the next change; findable by heading; one fact per line.

## Reference architecture

A proven layout (generalize to the project — not every project needs every file):

- **Root `CLAUDE.md` / `AGENTS.md`** — project-wide: git workflow, build/test/lint
  commands, code style, product boundaries, an architecture pointer, harness rules.
  May be a thin stub that points to the real guideline files. Keep both names
  resolvable (or make one a one-line pointer to the other) so Claude and Codex both
  find it.
- **`PRODUCT.md`** (products only) — purpose, brand, users, anti-references.
- **`doc/` (or `docs/`)** — durable architecture, decisions, and principles. Add
  **`doc/AGENTS.md`** stating *what lives where* (placement rules) so future notes
  land in the right file.
  - Split by concern: `*-architecture.md`, `design-principles.md`,
    `testing-principles.md`, `internationalization-principles.md`, and so on.
  - Screen/module-level specs in a `doc/plan/` subtree.
- **Nested `AGENTS.md`** in each major subtree (`server/`, `web/`, `demo/`, …) —
  local ownership boundaries, gotchas, and commands that only matter there.
- **Memory convention** — if the runtime has a memory store, note where durable
  cross-session facts belong versus repo docs, so agents don't scatter lore.

## Workflow

1. **Survey.** Resolve the repo root. Inventory existing docs (`rg --files -g '*.md'`),
   the tech stack and layout (package manifests, top-level dirs), and how the project
   is built/tested/run. Note what already exists so you extend rather than overwrite.
2. **Read before writing.** Read every existing `AGENTS.md` / `CLAUDE.md` / doc index
   in scope. Preserve existing ownership boundaries and conventions.
3. **Design the IA.** Map subjects → canonical owner using the reference
   architecture, sized to the project. Decide root vs. nested vs. `doc/` placement and
   the cross-links between them. Surface the plan before creating files.
4. **Create structure from real facts.** Write the root doc, `doc/AGENTS.md`
   placement rules, and per-subtree `AGENTS.md` stubs. Fill only with verified
   commands / paths / structure. Where a section needs product intent you do not have,
   leave a clearly-marked TODO for the user rather than inventing it.
5. **Wire maintenance.** Point the new structure at its upkeep skills (doc-add for new
   notes, doc-update / `doc-polish` for refresh and compaction) and at `harness-setup`
   for executable guards. Keep each new file at the right altitude and signal density.
6. **Review and report.** Run an independent review pass (subagent or a clearly
   separate pass) for contradictions, duplicated ownership, invented lore, wrong
   altitude, and broken cross-links. Fix confirmed findings, then report: files
   created, the ownership map, TODOs left for the user, and follow-up skills.

## Guardrails

- Do not invent product concepts, history, or rationale. Populate durable docs only
  from verified repo facts or explicit user input; mark unknowns as TODO.
- Do not overwrite or weaken an existing `AGENTS.md` / `CLAUDE.md` — extend and
  preserve scoped ownership. Surface conflicts instead of resolving them silently.
- Do not duplicate a subject across files; pick one owner and cross-link.
- Do not create status logs or session narration. This skill builds durable structure.
- Do not encode secrets, credentials, or private machine paths into project docs.
- Leave executable guard installation to `harness-setup`; do not reimplement it here.
