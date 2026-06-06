---
name: "dead-code-removal"
description: "Remove dead code safely from software repositories. Use when the user asks to prune, delete, or clean up dead code, unused exports/files/functions/dependencies, stale feature code, or wants dead-code findings verified before removal. Do not use for ordinary refactors, formatting-only cleanup, or broad dependency upgrades."
---

# Dead Code Removal

Remove unused code with evidence, small patches, and deterministic verification.
Static analyzers are leads, not proof.

## Scope

Use this skill for:

- unused files, exports, functions, classes, imports, variables, routes, tests, fixtures,
  assets, non-deploy generated outputs with verified regeneration sources, and
  dependencies
- cleanup after feature removal, deleted flags, abandoned modules, or completed
  migrations when removing obsolete scaffolding/helpers rather than historical migrations
- validating dead-code reports before applying deletions

Do not use it for generic refactors, style cleanup, dependency upgrades, or deleting
code merely because it "looks old".

## Baseline

1. Read nearest repo instructions (`AGENTS.md`, `CLAUDE.md`, project docs) and current
   git status. Never revert unrelated user changes.
2. Identify package boundaries, public APIs, generated code, plugin/entrypoint
   conventions, build tags, test-only imports, and reflection/dynamic loading.
3. Identify preservation zones before trusting analyzer output: tracked archives,
   backups, historical snapshots, generated deploy artifacts (`dist/`, `build/`,
   static exports), ignored scratch/log folders, and directories explicitly ignored by
   harness or docs. Treat these as intentionally kept unless the user explicitly scopes
   them for removal.
4. Establish the verification surface before deleting: tests, typecheck, lint, build,
   route/storybook/demo smoke checks, or language-specific commands.

## Evidence Rules

- Treat public APIs, exported symbols, framework entrypoints, migrations, CLI commands,
  config-loaded files, generated-code hooks, reflection targets, and test fixtures as
  reachable until proven otherwise.
- Require at least two signals before deleting broad or exported code: static analyzer
  output, import/reference search, compiler/linter diagnostics, coverage/runtime data,
  package manifest entrypoints, route registration, test failure/success, or owner docs.
- One strong signal is enough only for local private code already rejected by the
  compiler/linter, trivial unused imports/variables, or files unreachable by manifest
  and reference search.
- Analyzer "unused files" output is never enough to delete a whole directory, tracked
  archive/backup/snapshot, generated deploy artifact, ignored local artifact, or
  historical copy. Require either explicit user scope plus evidence, or owner
  documentation plus git-history and reference-search evidence.
- If removal changes user-visible behavior or deletes an unclear product feature, stop
  and ask instead of guessing.
- Stop and ask before deleting broad directories, preserved historical folders, deploy
  artifacts, ignored/transient local artifacts, or unusually large batches unless the
  user explicitly scoped that cleanup and the evidence supports deletion.

## Trusted Tools

Prefer tools already configured in the repo. When adding or temporarily running a new
tool, verify current maintenance, stars/adoption, releases, and official docs/repo
status first. Examples checked as credible on 2026-06-06:

- JavaScript/TypeScript: `knip` for unused files, exports, and dependencies. Prefer it
  over stale `depcheck` or maintenance-mode `ts-prune` unless the repo already uses
  those tools.
- Go: `staticcheck` (`U1000`) plus `go test ./...` and package-level reference search.
- Python: `vulture` for dead code, with `--min-confidence 100` for conservative passes;
  pair with `ruff`, `pyflakes`, or existing lint. Use whitelists for dynamic usage.
- Rust: `cargo +nightly udeps` for dependency evidence when nightly is acceptable;
  `cargo machete` for fast unused-dependency leads. Pair with `cargo check`, `cargo test`,
  and `cargo clippy` when available.
- Other ecosystems: use the compiler/linter, package manager, framework manifests, and
  high-trust project-native analyzers first. Avoid obscure low-star tools unless the repo
  already depends on them.

## Workflow

1. Inventory candidates:
   - run existing lint/typecheck/test commands if cheap
   - run ecosystem analyzer(s) where useful
   - search references with `rg`, language servers, compiler output, and manifest
     entrypoints
2. Classify findings:
   - **safe local**: private unused imports/vars/functions with compiler/linter support
   - **needs proof**: exported symbols, files, dependencies, routes, assets, fixtures
   - **do not delete yet**: dynamic/reflection/plugin/config/generated/test-only usage,
     tracked archive/backup/snapshot folders, deploy outputs, ignored scratch/log
     folders, historical mirrors, and anything docs or harness config marks as special
3. If the user asked only to verify/review a dead-code report, stop after classification
   and report candidates, evidence, confidence, and keep/delete recommendation.
4. Delete in small, reviewable batches. Start with leaf code and unused dependencies
   only after code references are gone.
5. Update callers, imports, manifests, lockfiles, docs, tests, snapshots, generated
   indexes, and build config affected by the deletion.
6. Re-run the relevant analyzer and full verification surface. If a deletion uncovers
   hidden coupling, revert only your own attempted deletion for that item and mark why.
7. Repeat until the requested scope is clean or remaining candidates are documented as
   intentionally kept.

## Output

Report:

- deleted files/symbols/dependencies, grouped by reason
- evidence used for non-trivial deletions
- commands run and results
- candidates intentionally kept and why
- residual risk, especially dynamic loading, public API, generated code, or incomplete
  test coverage
