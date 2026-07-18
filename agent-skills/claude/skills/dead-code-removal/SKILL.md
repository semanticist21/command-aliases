---
name: "dead-code-removal"
description: "Find and remove unused files, exports, functions, deps, or stale features."
---
# Dead Code Removal

Find and remove genuinely unused code within the requested scope. Treat analyzers as leads, not proof.

1. Read repo instructions, status, package/entrypoint boundaries, generated/vendor zones, public APIs, dynamic imports, reflection/config loading, migrations, docs, tests, and release tooling. Establish required checks before editing.
2. Inventory candidates with language/package tools plus `rg`; classify each as proven dead, likely dead but dynamic/uncertain, intentional compatibility surface, or out of scope. For review-only requests, stop here.
3. Require evidence: no static references, no runtime/config/plugin convention, no public consumer, and no preservation-zone rule. Do not delete archives, lockfile-only dependencies, generated sources, migrations, or externally consumed APIs merely because local search is quiet.
4. Remove in small batches, starting with leaves. Update imports, callers, manifests/lockfiles, tests, snapshots, docs, generated artifacts, and configuration together.
5. Re-run analyzers plus focused and required project verification after each meaningful batch. Revert/repair a batch if behavior, build, packaging, or migration integrity breaks.

Report removed items with evidence, verification, kept candidates and why, and remaining risk. Preserve unrelated work and stage only explicit paths.
