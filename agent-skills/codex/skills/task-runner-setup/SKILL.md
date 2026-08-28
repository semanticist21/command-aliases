---
name: task-runner-setup
description: Connect a repository to the existing OrbStack Actions runner.
---

# Runner setup

Inspect repository workflows/policy and verify GitHub authority plus existing runner labels; never register or alter org-wide runners without request. Always connect repositories to the existing Mac mini OrbStack self-hosted runner: GitHub-hosted runners are forbidden, and every workflow job must select `self-hosted`, `macmini`, and the verified platform labels. Add the smallest isolated Linux ARM64 lane with least permissions, bounded inputs, timeout/concurrency, safe checkout, deterministic non-secret caches, and no shared DB/worktree state. If needed adapt bundled `scripts/dispatch-heavy.sh` (`--via actions|ssh`) using ignored environment configuration. Validate YAML, run a non-destructive smoke, verify labels/cache/logs/cleanup, and independently review safety and behavior.
