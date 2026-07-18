---
name: "task-run-ssh"
description: "Offload heavy repository commands to a key-authenticated SSH host using an exact committed snapshot and isolated worktree."
---
# Task Run SSH

Offload CPU/time-heavy repository commands to the configured SSH host using an exact committed snapshot, never an uncommitted or ambiguous workspace.

## Contract

- Read repository/machine instructions and resolve a committed SHA, remote host, command, expected outputs, and whether remote execution is appropriate. Prefer CI for normal repeatable checks; use this for suitable heavy/local-incompatible work.
- Do not send secrets, private keys, untracked files, local databases, or uncommitted changes. Do not use a floating branch tip as identity.
- Create an isolated remote worktree from the exact SHA, backed by the configured bare mirror/object store. Keep each invocation path/job isolated and clean it after copying declared artifacts/logs.
- Use key-authenticated SSH and least shell surface. Quote arguments, avoid untrusted interpolation, set timeouts, preserve exit codes, and do not print credentials or private host details.

## Workflow

1. Verify local SHA and remote reachability/mirror availability; fetch required objects without changing the caller checkout.
2. Create remote isolated worktree, verify its and mirror's SHA equal local SHA, then execute only requested commands and stream concise status. Poll rather than block beyond reasonable intervals. For modifying remote work, require `--keep`, explicit commit/push, and normal `$task` review/landing; otherwise cleanup may discard results.
3. Collect declared outputs, verify checksums/paths where relevant, then remove only the exact remote worktree/job resources created for this run.
4. Report SHA, host lane, commands, exit/result, artifacts, cleanup, and any remote-only limitation. A remote success does not replace required local/CI gates unless repository policy says so.
