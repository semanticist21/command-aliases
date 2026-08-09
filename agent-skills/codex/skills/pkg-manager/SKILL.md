---
name: pkg-manager
description: Safely update dependencies or perform explicit major upgrades.
---

# Package manager

`update` stays within current majors; `upgrade` permits named majors. Ask when mode/scope is unclear. Inspect manifests, lockfiles, workspace/runtime constraints, advisories, release notes, and migration guides; change only requested packages, repair required API/config migrations, and avoid unrelated churn. Run install integrity plus affected build/lint/tests and inspect the final dependency graph/diff. Report unresolved breaking/security risk; never smuggle a major into an update.
