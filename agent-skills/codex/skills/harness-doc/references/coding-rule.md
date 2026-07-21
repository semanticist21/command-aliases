# Coding Rule Reference (canonical seed)

Seed content for `docs/coding-rule.md` when `harness-doc setup` bootstraps a project. Adapt to the project's stack; do not copy verbatim unless the rules match.

## File size and structure

- **Target file size: 200-500 lines** for source files (frontend, backend, scripts, configs). Agents read, navigate, and manage smaller files more reliably; context stays focused.
- **Under 200** — fine if cohesive. Too small may indicate premature splitting; merge back if a file is just re-exporting one symbol.
- **Over 500** — split by responsibility (route, feature, layer). Agents lose context tracking in large files; a 1000-line file is a readability defect even if it works.
- **One responsibility per file** — agents grep for a symbol or rule and want the whole answer in one place. Do not mix concerns to hit a size target.
- **AGENTS.md files** — root under 150 lines, folder-local under 30 lines. These are indexes, not manuals.

## Folder ownership

- Each source folder owns one concern. If a second concern appears, split the folder.
- Co-locate tests next to source (`*.test.ts[x]`). Do not create a parallel `__tests__/` tree.
- Route logic by scope:
  - Cross-route / cross-feature logic → `src/features/<slice>/` (Bulletproof-style slice).
  - Single-route logic → route-local `_`-prefixed folders (`_lib`, `_components`, `_hooks`), which Next.js excludes from routing.
  - App-specific wiring / singletons → `src/lib/`.

## Comments

- Comments explain why, constraints, trade-offs, or non-obvious invariants. Do not restate what the code already says.
- Update or remove stale comments in the same edit that changes the code.
- Global / reusable code: include a brief Korean (or project language) comment on intent and context so future agents have the why.
- Code reflecting an external source (docs, examples, references): keep a source/attribution memo comment near the code.

## Imports and boundaries

- Apps may import packages. Packages may import packages. Packages must not import apps.
- App package names are bare (`portal`, `console`). Shared libraries use `@repo/*`.
- New app names must be added to the lint `noRestrictedImports` group for package code.
- Avoid circular dependencies within a slice; break by extracting to a shared `utils/` or `lib/`.

## Types and validation

- Parse, don't validate. Use zod (or equivalent) at the boundary; infer types from the schema.
- No `any` in shared code. Use explicit types or `never` / `unknown` where the type is genuinely open.
- Exhaustive match for union types; add a `default: never` that catches new variants at compile time.

## Error handling

- Typed errors at boundaries. Do not throw strings or `Error` without a code.
- `try`/`catch` only where you can actually handle the error. Let it bubble otherwise.
- Never swallow errors silently. At minimum log with context.

## Naming

- Files: `kebab-case.ts` for modules, `PascalCase.tsx` for components.
- Functions: `camelCase`. Types/interfaces: `PascalCase`. Constants: `SCREAMING_SNAKE_CASE`.
- Names describe behavior, not implementation. `fetchUserOrders`, not `getData`.

## Tests

- Test behavior, not implementation. Refactors should not break tests.
- One assertion concept per test. Name tests by what they verify.
- Shared setup lives in a preload or a test utils file; do not duplicate across test files.

## Dependencies

- Root `workspaces.catalog` centralizes multi-workspace deps with caret ranges. Keep single-workspace deps local.
- Exact versions only for verified compatibility constraints.
- Prefer standard library / platform features over new deps. Add a dep only when it replaces non-trivial code.

## When to defer to the project

This is a seed. Project-specific rules override these defaults. If `docs/coding-rule.md` exists in the project, it is the authority; this reference is only the starting point when bootstrapping.