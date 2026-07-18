---
name: "task-runner-setup"
description: "Connect a repository to the existing OrbStack GitHub Actions runner with safe workflow, cache, and verification setup."
---
# Task Runner Setup

Configure the existing Kobbokkom OrbStack Linux ARM64 self-hosted GitHub Actions runner for a repository. Use only when runner setup is requested; preserve repository workflow conventions and do not expose credentials or private host details.

## Preconditions and scope

- Read repository instructions, existing workflows, Actions settings, and runner documentation before changing anything. Resolve owner/repo and required commands; ask only for materially ambiguous repository, workload, or authority.
- Prefer a dedicated manually dispatched heavy workflow or existing lane, never silently reroute all CI. Send macOS-only work through `$task-run-ssh`; use this runner only for CPU/time-heavy Linux-compatible work.
- If invoked with repository migration, use its verified destination name/immutable ID; do not rediscover stale origin.

## Configure

1. Verify GitHub access, Actions enabled, runner availability/labels, and repository policy. Reuse an existing runner; do not register a new runner or alter organization-wide settings unless explicitly requested.
2. Add the smallest workflow change: explicit `runs-on` self-hosted labels, least privileges, bounded `workflow_dispatch` inputs, concurrency/isolation, timeouts, and safe checkout. Do not interpolate untrusted input into shell.
3. Use external-disk caches only with deterministic keys, restore keys scoped to OS/arch/toolchain/lockfile, and no secrets or mutable worktree state. Isolate each job/worktree; do not share databases, build dirs, or credentials across runs.
4. Preserve normal CI, project verification, branch protections, and secret boundaries. Never print environment/secrets or use broad write tokens.

## Verify and finish

- Lint/validate workflow, run a destination-repository smoke dispatch, and verify selected labels, commands, checkout, cache miss/hit behavior, artifacts/logs, cleanup, and no shared-state leakage.
- For real setup run two independent read-only reviews: safety/configuration and workflow behavior. P0–P2 findings block; fix and rerun relevant verification/review.
- Report files, runner labels/lane, smoke run URL/result, cache evidence, reviewer outcomes, and remaining constraints.
