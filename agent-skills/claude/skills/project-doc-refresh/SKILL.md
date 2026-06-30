---
name: project-doc-refresh
description: "Use when project documentation must be refreshed against the current repository state, including README, docs index, coding rules, architecture notes, package/app layout, command lists, and stale references after files move."
metadata:
  short-description: Refresh project docs from repo state
---

# Project Doc Refresh

Use this skill when the user asks to update docs, sync docs with current code, fix stale structure notes, or add a current-status document.

## Workflow

1. Read the repo-root `AGENTS.md`, `README.md`, `docs/README.md`, `package.json`, workspace package manifests, and the nearest nested `AGENTS.md` for folders you will edit.
2. Inspect real structure with `rg --files`, `find apps packages -maxdepth 4`, and targeted file reads. Treat the filesystem and package manifests as source of truth.
3. Compare docs against the live repo:
   - commands and scripts
   - apps/packages list
   - framework/runtime versions
   - import boundaries
   - folder ownership
   - generated/tooling paths such as `.agents` and `.claude`
4. Rewrite docs to be short, factual, and action-oriented. Remove historical explanation unless it is still operationally useful.
5. Keep docs split by importance:
   - `docs/coding-rule.md` for day-to-day engineering rules
   - `docs/playbooks/` for setup, automation, or repeatable operational procedures
   - `docs/README.md` as a compact index only
6. Update indexes and cross-links whenever a document moves or is added.
7. Run `bun run lint` after edits when feasible. Run `bun run typecheck` only if code changed or docs reference TypeScript contracts.

## Guardrails

- Do not invent architecture. If the repo does not contain it, document it as absent or omit it.
- Prefer exact paths and script names over broad prose.
- Keep generated logs out of `docs/`; use folder-local `AGENTS.md` for working history.
- Preserve user edits in dirty files. Read diffs before replacing shared docs.
