---
name: "dead-code-removal"
description: "Find and remove unused files, exports, functions, deps, or stale features."
---
# Dead Code Removal

Find and remove code, assets, exports, dependencies, or stale features that are demonstrably unused. Do not equate “no obvious reference” with safe deletion.

## Workflow

1. Read instructions and map build/runtime entry points, generated code, dynamic imports/reflection, routes, scripts, config, package exports, tests, docs, and deployment references.
2. Produce candidates with evidence from repository search plus language/build tooling. Check public APIs, plugin registration, serialization, migrations, feature flags, CSS/template references, and external invocation risk.
3. Ask before deleting behavior whose usage cannot be proved locally or is a product/compatibility decision. Keep shared/public contracts unless deprecation/removal is explicitly authorized.
   Also stop for explicit approval before broad directories or large deletion batches, even when locally proven unused.
4. Remove the smallest coherent set: implementation, now-unused imports/exports/tests/assets/config/dependencies, and stale docs. Use repository deletion conventions; preserve unrelated dirty changes.
5. Run focused tests/build/type/lint, dependency lockfile checks, and relevant runtime/UI verification. Search again for references and inspect the diff for accidental scope expansion.

Report removed items, proof of unused status, verification, retained uncertain candidates, and compatibility risk.
