---
name: update-doc
description: Use when updating local repo documentation, especially Codex-facing `.context` docs such as `.context/README.md`, `.context/doc/*.md`, page-scoped `.context/AGENTS.md`, or `.context/FIGMA.md`; also use after code/config/test/deploy changes that should leave durable context for future agents.
metadata:
  short-description: Update local Codex context docs
---

# Update Doc

Use this skill to keep local, repo-scoped documentation aligned with the actual codebase.
Prefer source-of-truth inspection over memory or assumptions.

## Workflow

1. Locate the repo root and check for `.context/README.md`.
2. Read `.context/README.md`, then `.context/doc/README.md` if present.
3. If the task targets a page or feature, search upward from that folder for a local `.context/`.
4. Inspect the relevant source files before editing docs. Use `rg`/`rg --files` first.
5. Update the smallest relevant doc file; update README/index files only when the doc set or navigation changes.
6. Verify file visibility with `git status --short --ignored` when paths include ignored names like `AGENTS.md`.
7. Run formatting/lint checks for docs only if the repo already has the tool available.

## Document Selection

For repos using `.context/doc`, choose docs by purpose:

- `NAVIGATION.md`: where Codex should start, repo map, route/page discovery order.
- `ARCHITECTURE.md`: layer boundaries, FSD rules, route wiring, import direction.
- `API.md`: API client patterns, request/response schemas, mock-server contracts.
- `CONFIG.md`: app/env differences, base URLs, Next/Nx config, ports.
- `DEPLOY.md`: pre-deploy checks, build/deploy workflows, merge preparation.
- `TESTS.md`: E2E/Vitest setup, scripts, ports, flaky workflow constraints.
- `DESIGN.md`: tokens, Tailwind/shadcn conventions, `cn`/class merge rules.
- `template/FIGMA.md`: copyable page `.context/FIGMA.md` skeleton only.
- `template/AGENTS.md`: copyable page `.context/AGENTS.md` skeleton only.

## Page Context Rules

- Page-specific facts belong in the nearest page or feature `.context/`, not global docs.
- `FIGMA.md` should store lookup artifacts: source links, spec/planning nodes, screens, crops, cases, popups.
- `AGENTS.md` should store durable implementation notes: corrected mistakes, verification quirks, page-specific decisions.
- Do not use page `AGENTS.md` as a running status log.
- Preserve route-group segments like `(home)` when creating page context paths.

## Source-Of-Truth Checks

Before writing, verify the real files that the doc will describe:

- Scripts: `package.json`, `scripts/**`, workflow files.
- Config: `apps/*/next.config.*`, `.env*`, `nx.json`, `project.json`.
- API: `libs/entities/api-client`, `libs/shared/api-*`, `apps/mock-server/routes`.
- Tests: `playwright.config.*`, `vite.config.*`, `vitest.config.*`, `scripts/verify-e2e`.
- Design: `tailwind.css`, app `global.css`, `libs/shared/util/src/lib/cn.ts`, shared/entity UI libs.
- Architecture/navigation: `apps/*/app`, `libs/domains`, `libs/layouts`, `libs/entities`, `libs/shared`.

## Guardrails

- Do not paste credentials, tokens, registry auth, or private secrets into docs.
- Do not document aspirational behavior as current behavior; mark unknowns plainly or verify them.
- Do not rewrite unrelated docs just for style.
- If a doc path is ignored by Git, add the narrowest possible unignore rule or use a trackable filename.
- Keep docs concise and practical for the next agent, with paths and commands they can act on.
