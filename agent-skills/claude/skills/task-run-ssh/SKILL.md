---
name: "task-run-ssh"
description: "Offload heavy repository commands to a key-authenticated SSH host using an external-storage bare object mirror and an exact-commit isolated worktree. Resolve a persistent recorded SSH alias before asking or guessing the remote user. Use for ad hoc builds, tests, analysis, or remote agent jobs that do not fit a GitHub Actions runner, including synchronous runs and detached jobs with status or log retrieval."
---
# Task Run SSH

Run heavy repository work on the configured SSH host, always against an exact committed snapshot in an isolated remote worktree.

## Safety gate

Use only for commands the user/repo authorizes. Read local instructions and status; commit or otherwise resolve the exact source revision first. Never send secrets, mutate the remote’s shared checkout, guess a host/user/path, use password auth, or treat a remote success as proof of local changes.

## Resolve and bootstrap

Use existing `TASK_RUN_SSH_HOST`/`TASK_RUN_SSH_ROOT`; otherwise read durable machine context, then ask for the exact target. Verify public-key SSH and host identity before use. Bootstrap only with confirmed account/host: a named SSH alias, keychain-loaded identity, restricted external task root, and recorded variables. Do not run `ssh-copy-id` or alter remote configuration without explicit authority.

## Job contract

1. Ensure the remote bare mirror and newly created unique worktree both resolve exactly to local SHA; stop on mismatch, never fall back to a branch name or dirty files. Record repository, SHA, command, start time, and log path.
2. Run with explicit environment, bounded resources/timeouts where possible, and streamed logs. For detached jobs return a task ID plus status/log/cancel commands; never lose ownership of background work.
3. Reuse caches outside worktrees, isolate temp dirs, and prevent concurrent jobs from sharing a writable worktree or mutable checkout.
4. Collect exit status and relevant logs, clean only the exact job worktree/temp paths after retention needs are met, and report SHA, host alias, command result, artifacts, and cleanup status.

Remote execution is a verifier/worker, not a landing mechanism; finish repository changes through the project’s normal workflow.
