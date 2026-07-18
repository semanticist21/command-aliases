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
