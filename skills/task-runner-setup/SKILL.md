---
name: task-runner-setup
description: Connect a repository to the self-hosted Actions runner estate without pinning it to one machine.
---

# Runner setup

Inspect repository workflows and policy, verify GitHub authority and the current runner estate, and never alter organization-wide runners without request. GitHub-hosted runners are forbidden. Select observed capability labels rather than a named machine; pin only for a real architecture, toolchain, artifact, cache, or persistent-state requirement and document why.

Read [references/operations.md](references/operations.md) for label semantics, scale-to-zero discovery, container/runtime traps, shared-host naming, consumer dispatch, and smoke tests. Add the smallest isolated lane with least permissions, bounded inputs, timeout/concurrency, safe checkout, deterministic non-secret caches, and no shared database/worktree state. Creating, rebuilding, or recovering a runner host, VM, service, storage layout, or estate belongs to `environment-sync` and its registered canonical estate. Validate YAML, run a non-destructive smoke, verify labels/cache/logs/cleanup, and independently review safety and behavior.
