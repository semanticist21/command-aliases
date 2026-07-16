---
name: "task-run-ssh"
description: "Offload heavy repository commands to a key-authenticated SSH host using an external-storage bare object mirror and an exact-commit isolated worktree. Use for ad hoc builds, tests, analysis, or remote agent jobs that do not fit a GitHub Actions runner, including synchronous runs and detached jobs with status or log retrieval."
---

# Task Run SSH

Run `scripts/task-run-ssh.sh` from a Git repository. It sends one committed Git
snapshot, never the caller's working-tree changes, and executes the command in a
new detached remote worktree.

## Safety gate

- For a read-only build, test, benchmark, or analysis of an existing commit, run
  the script directly.
- Before planning, setting up, or executing work that will modify the target
  repository, invoke `$task` first. Continue from the isolated task worktree it
  creates, commit the handoff snapshot, then offload that exact commit.
- Treat a remote agent that edits files as a modifying task. Use `--keep`, require
  it to commit/push its result explicitly, and review that result through the
  normal `$task` workflow. A retained remote worktree is not a merge mechanism.
- Never stash, reset, clean, checkout, or otherwise alter a dirty caller tree.
  Uncommitted and untracked files are intentionally excluded.

## Prerequisites

- Configure public-key authentication and the host alias in SSH config. The
  script forces `BatchMode=yes`; never pass or store a password.
- Install Bash and Git on both machines.
- Choose an absolute remote root on external storage. Supply host and root at
  runtime; never write private hostnames, mount paths, credentials, or keys into
  this skill or a repository.

```bash
export TASK_RUN_SSH_HOST='<ssh-config-alias>'
export TASK_RUN_SSH_ROOT='<absolute-external-storage-path>/task-run-ssh'
export TASK_RUN_SSH_CACHE_MAX_GB=200
export TASK_RUN_SSH_MIN_FREE_GB=50
```

## Run jobs

Pass commands as arguments after `--`; do not interpolate them into an SSH shell
string. Use `bash -lc '...'` explicitly only when shell syntax is required.

```bash
# Wait and stream output. The command's exit code becomes the local exit code.
scripts/task-run-ssh.sh run -- npm test

# Detach, then use the printed task ID.
scripts/task-run-ssh.sh run --detach -- cargo test --workspace
scripts/task-run-ssh.sh status <task-id>
scripts/task-run-ssh.sh logs <task-id>
scripts/task-run-ssh.sh logs --follow <task-id>
```

The default repository key is derived from the repository name and a hash of its
origin URL. Set `--repo-key <safe-name>` when clones use different origin forms or
when querying a job outside its local clone.

By default, the remote exact-commit ref and worktree are removed after the command
finishes; detached job status, exit code, and logs remain. Use `--keep` only when
the worktree itself is needed, then remove all task data explicitly:

```bash
scripts/task-run-ssh.sh clean --repo-key <safe-name> <task-id>
```

`clean` refuses queued or running tasks. It does not kill remote processes.

## External cache and temp

Each repository uses `$TASK_RUN_SSH_ROOT/cache/<repo-key>`. Before every run, the
script measures that cache and external root. When the cache exceeds
`--cache-max-gb` (default 200 GiB), or root free space falls below
`--min-free-gb` (default 50 GiB), it deletes cache files older than 30 days,
measures again, and refuses to start if either limit is still violated.
The same guard runs after every synchronous or detached job. A command that leaves
the cache over cap or the external root below its floor is recorded as failed even
when the command itself exits zero.

Remote commands receive `XDG_CACHE_HOME`, `npm_config_cache`,
`YARN_CACHE_FOLDER`, `COREPACK_HOME`, `GRADLE_USER_HOME`, `PUB_CACHE`,
`CCACHE_DIR`, `SCCACHE_DIR`, `HOME`, `CARGO_HOME`, `GOPATH`, and
`MAVEN_CONFIG` under that repository cache. They receive a
job-scoped external `TMPDIR`, `TMP`, and `TEMP`, removed when the job finishes.
The task output and `status` report the cache path. Do not set a shared
`CARGO_TARGET_DIR`; Cargo keeps its normal worktree-local target directory.

## Exact-commit contract

The script resolves `--commit` (default `HEAD`) locally, transfers its reachable
objects into the remote bare mirror, creates a task ref, and verifies that the
remote ref and worktree `HEAD` both equal the local commit before executing. If
any check differs, stop; do not retry against a branch name or the caller's dirty
files.
