---
name: "task-runner-setup"
description: "Connect a repository to the existing OrbStack Linux ARM64 GitHub Actions runner, with external-disk caches and direct-SSH routing for macOS-only work. Use for runner workflow design, cache design, or remote task/review preparation."
---
# Task Runner Setup

Connect a repository to the managed Linux ARM64 runner safely. Use SSH routing only for genuinely macOS-only work; do not ask the user to choose the routing when repository evidence decides it.

1. Invoke `$task` first for this repository-changing work; inspect, edit, verify, and land only in its prepared worktree. Then read repository instructions, workflows, package manager, commands, secrets/permissions policy, and runner labels.
2. Select jobs: Linux ARM64 jobs target the configured self-hosted labels; macOS/Xcode/signing jobs remain on their approved macOS lane or use the documented SSH runner contract. Never run untrusted fork PR code on a privileged self-hosted runner.
3. Create minimal workflows with least-privilege `permissions`, explicit checkout/ref, concurrency group and cancellation semantics, bounded timeouts, deterministic dependency installation, and external-disk cache keys that include OS/arch/toolchain/lockfile. Keep caches out of the checkout and never cache secrets/build signing material.
4. Protect artifacts/logs, use repository secrets only where needed, and ensure cleanup cannot delete shared cache roots or another job’s worktree. Make jobs rerunnable and safe under parallel PRs.
5. Validate workflow YAML, labels, triggers, cache restore/save behavior, required commands, failure reporting, and one safe execution path. Have independent safety and behavior review for meaningful workflow changes.
6. Give the repo a local dispatch script so heavy work is always one command from a local checkout. Adapt `scripts/dispatch-heavy.sh`: `--via actions` pushes the current branch and dispatches the `workflow_dispatch` workflow (logs/artifacts in Actions); `--via ssh` rsyncs a clean snapshot to the SSH lane and runs a command there (no commit/push/queue). Read host/root/workflow from the environment or a git-ignored `.dispatch-heavy.env`; never bake private hosts, paths, or credentials into the committed script. Verify both routes with `--dry-run`.

Report routing, files, labels, permissions, cache keys, verification, remaining prerequisites, and rollback path. Do not register, replace, or remove a runner without explicit owner authority.
