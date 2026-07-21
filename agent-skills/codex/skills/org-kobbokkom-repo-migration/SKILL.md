---
name: "org-kobbokkom-repo-migration"
description: "Safely transfer GitHub repositories into Kobbokkom with gh CLI preflight, execution, and audits."
---
# Kobbokkom Repository Migration

Transfer existing repositories to the fixed `Kobbokkom` organization with `scripts/transfer-repo.sh`. Never log tokens, passwords, private keys, or credential-bearing remote URLs.

## Execution

- Resolve source from user input or current `origin`. Inspect/preflight means dry-run. An actual migration runs dry-run then `--execute` without a confirmation string.
- Ask only when source cannot be resolved, plausible source/destination choices materially differ, GitHub authority is unavailable, or a separately destructive choice is unspecified.
- Preserve visibility and local remotes unless explicitly changed. Use `--new-name`, `--visibility private`, or `--update-remote origin` only when requested.
- The script verifies auth/admin/org-owner access, target availability, visibility, and audit surfaces; refresh `read:packages` if asked. It transfers through GitHub, polls destination and immutable ID, then compares Actions/workflows/variables/rulesets/Pages/packages/webhooks/deploy keys/secrets/environments. Any mismatch or unreadable audit is unfinished.

## Batch and runner pairing

- Batch one at a time: dry-run all sources, stop on any failure, then execute sequentially. Never parallelize.
- When explicitly paired with `$task-runner-setup`, transfer first and pass verified `Kobbokkom/<name>` plus immutable ID to runner setup; do not rediscover old origin. Keep remotes unchanged unless separately requested.

## Completion QA

After actual transfer (and paired runner smoke run), obtain exactly two independent read-only reviews: state/safety (destination, ID, visibility, audited settings; paired runner events/labels/permissions/concurrency/secrets) and behavior (workflow commands; paired smoke/cache isolation). P0–P2 blocks completion: fix, re-audit/smoke, and recheck. Report evidence and final URL only after both clear.

## Actions runtime audit

Before declaring handoff complete, audit every checked-in `.github/workflows/*.{yml,yaml}` file and one explicitly non-destructive post-transfer smoke run.

- Never trigger a deployment, publish, or privileged workflow as migration QA. If the repository has no workflow files, record that and do not block the migration. Otherwise choose a trusted-ref smoke workflow, inspect permissions, secrets, environments, cache writes, and external effects, and leave the handoff pending when safety cannot be established.
- Resolve current action majors from upstream tags. At this revision `actions/checkout@v7` and `actions/setup-node@v7` are the Node 24-compatible majors. Resolve every `runs-on` lane, including non-matrix jobs, and require Actions Runner `v2.327.1+` plus a Node 24-supported OS/architecture; record the runner version, OS, architecture, and labels.
- Before changing a major, review its release notes and metadata, preserve the repository’s SHA-pinning policy, and review cache and privileged-workflow effects.
- Update stale JavaScript action refs only within the requested scope. Keep a project toolchain input such as `node-version: '22'` unchanged unless a separate runtime upgrade was requested.
- Parse all workflow YAML and classify each `uses:` ref by execution type: JavaScript, Docker, composite/local, or reusable workflow. Record ref form separately (major, tag, or SHA); a SHA-pinned JavaScript action still receives the Node 24 check. Report non-JavaScript refs separately.
- Record the trusted workflow commit and conclusion for every tested lane; labels alone do not prove Node 24 support.
- Treat an old action runtime, unsupported runner lane, unknown label, or failed safe smoke run as an open follow-up.
