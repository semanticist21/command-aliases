---
name: doc-update
description: "Audit, refresh, and compact project documentation against the live repository. Use when the user invokes /doc-update, asks to update existing docs, remove legacy or stale documentation, sync docs with current files, or compact overly long AI-facing guidance to only what future agents need."
---

# Doc Update

Use this skill to make project docs match the current repository and stay compact.

## Input Shape

`/doc-update [existing document or scope; if omitted, audit all project docs]`

If the user names a file, start there. If no file is named, audit repo-level AI docs and project docs.

## Workflow

1. Read repo-root `AGENTS.md`, `docs/README.md`, root `package.json`, and any target documents.
2. Inspect live structure with `rg --files`, package manifests, and targeted file reads. Treat the filesystem as source of truth.
3. Find stale content:
   - missing, renamed, or moved paths
   - outdated commands or scripts
   - legacy tool references
   - architecture that no longer exists
   - duplicated rules across `AGENTS.md`, docs, Cursor, Copilot, and Claude files
   - ceremonial `## History` entries: timestamp-only "clarified/updated/refreshed X" lines
     and "did X migration" notes that git already shows. Keep only durable decisions,
     constraints, gotchas, and self-corrections; delete the rest (drop empty `## History`).
4. Update or delete stale content. Do not preserve history unless it remains operationally useful.
5. Compact long sections by keeping only constraints, commands, ownership boundaries, decisions, gotchas, and validation steps future agents need.
6. Keep docs split by purpose:
   - `AGENTS.md` for AI operating rules and durable local context
   - `docs/coding-rule.md` for day-to-day engineering rules
   - `docs/playbooks/` for repeatable procedures
   - `.agents/skills/*` for reusable AI workflows
   - `.cursor/rules/*`, `.github/instructions/*`, `.claude/*` as thin platform adapters
7. Update indexes and links when documents move or are added.

## Guardrails

- Do not invent architecture.
- Do not overwrite unrelated dirty user edits.
- Preserve secrets policy and local key paths without exposing secret contents.
- Prefer exact paths and commands over general prose.
- Leave source comments alone unless they are stale because of the same requested doc update.

## Verification

Run the narrowest relevant check:

```bash
bun run skills:validate
```

Run `bun run lint` if Markdown or config formatting changed in a way Biome checks. Run typecheck only when code or typed config changed.
