---
name: "pkg-manager"
description: "Safely update dependencies within current major versions or upgrade across majors, including migration repairs, risk assessment, and decision gates."
---

# Package Manager

`pkg-manager update` may make patch/minor changes only. `pkg-manager upgrade` may make major-version changes. If the user does not name one, ask; never treat a request to update as approval for a major change.

## Scope and setup

1. Work only in the current repository or an explicitly named project. For each repository that will change, invoke `$task` and continue in its prepared worktree.
2. `update` or `upgrade` without package names means every eligible direct dependency in the requested project. Respect any narrower package, workspace, or ecosystem scope the user gives.
3. Read the nearest `AGENTS.md`; identify the manifest, lockfile, workspace layout, package manager, prescribed checks, and baseline commit. Preserve unrelated dirty changes.
4. In a monorepo, use the root package manager's workspace-aware operation. Do not independently mutate member lockfiles.
5. Before changing files, record dependency manifests, lockfiles, installed/resolved versions, outdated output, peer constraints, and relevant release notes or migration guides. Never hand-edit a generated lockfile unless its owning manager cannot regenerate it.

## Version policy

1. Enforce the selected operation across manifests and lockfiles:
   - `update`: every changed direct and resolved dependency remains below its next major version. Refresh to the newest eligible patch/minor release.
   - `upgrade`: major versions are permitted, but only for selected or eligible direct dependencies. Keep documented compatibility groups aligned.
2. Prefer the detected manager's ordinary command:
   - npm: `npm update`; for major direct upgrades use explicit `@latest` installs or an approved updater.
   - pnpm: `pnpm update -r`; add `--latest` only for `upgrade`.
   - Yarn: Yarn 1 uses `yarn upgrade` / `yarn upgrade --latest`; Berry uses `yarn up -R` / `yarn up`.
   - Bun: `bun update`; add `--latest` only for `upgrade`.
   - Cargo: `cargo update`; widen manifest constraints only for `upgrade`.
   - Poetry, uv, and pip-tools: refresh through the lockfile tool; change declared major constraints only for `upgrade`.
   - Dart/Flutter: `flutter pub upgrade`; add `--major-versions` only for `upgrade`.
   - SwiftPM: use `swift package update`; change `Package.swift` major constraints only for `upgrade`.
   - CocoaPods: use `pod update [pod]`; change `Podfile` major constraints only for `upgrade`.
   - Gradle: use the tracked version catalog/build logic and repository-provided updater. If no updater exists, inspect the dependency graph and edit declared versions deliberately; do not invent a resolver command.
3. Review the manifest and lockfile after each batch. If an `update` crosses a major boundary, correct it through its owning manager and regenerate. Do not run a major-changing command merely to inspect a result.

## Migration assessment and repair

1. For each proposed major upgrade, identify breaking changes, removed APIs, peer/runtime/toolchain requirements, config and data migrations, security/support deadlines, and rollback difficulty from release notes and the repository's use of that dependency.
2. Classify the migration risk as low, medium, or high, with concrete evidence. State expected source, configuration, test, operational, or data changes before applying the major batch.
3. Make mechanical, documented migration repairs yourself: update source code, configuration, peer dependencies, generated artifacts, and tests; then rerun the affected check. Keep the smallest supported change.
4. Pause and ask the user before proceeding only when a material decision is genuinely required: incompatible migration paths, dropped runtime/platform support, a behaviour or API semantic change, a data/config migration or destructive rollback, a security/support trade-off, a significant runtime/toolchain change, or a choice that changes scope or cost. Present the risk, options, recommended default, and what will change; do not apply a chosen path until the user approves it.
5. Do not hide failures with broad skips, `--legacy-peer-deps`, forced resolutions, ignored scripts, weakened tests, or unreviewed overrides. Do not remove, downgrade, replace, or pin a dependency merely to make checks pass unless documented compatibility evidence justifies it.

## Verify and finish

1. Run the prescribed install, tests, lint, typecheck, build, and affected integration checks. Use the `$task` changed-surface verifier as the final gate.
2. Diagnose failures from their errors, migration guides, and dependency graph. Apply the smallest documented repair, rerun the failed check, then rerun the required suite.
3. Before committing, summarize each direct dependency's old/new version, intentional majors, migration risk and repairs, skipped/blocked packages, and verification evidence. Commit manifests, lockfiles, and required source/test changes together.
4. Finish only when the requested policy is satisfied, generated lockfiles are reproducible, required checks pass, and every dependency diff is explained. Otherwise report the exact blocker and the smallest remaining decision.
