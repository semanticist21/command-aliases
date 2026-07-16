---
name: "task-runner-setup"
description: "Connect a repository to the existing OrbStack Linux ARM64 GitHub Actions runner by default, with external-disk caches and automatic direct-SSH routing for macOS-only work. Use for repo-specific heavy CI offload, runner workflow setup, cache design, or worktree-based remote task/review preparation. Do not ask the user to choose a runner backend when an existing OrbStack runner is available."
---
# Task Runner Setup

Build a repeatable heavy-job path without turning the developer machine into an
unbounded cache or exposing credentials.

## Fixed defaults

- Default to the existing OrbStack Ubuntu Linux ARM64 machine. Do not ask which
  runner implementation, image, container, VM, or host type to use.
- Reuse an online runner labeled `orb`, `Linux`, and `ARM64`. When one exists,
  skip runner provisioning and configure only repository access and workflows.
- During multi-worktree work, prefer the GitHub runner for portable heavy Node,
  Rust, Flutter/Android, Docker, backend, build, test, and lint work to reduce
  load on the local development machine; keep focused, quick local checks available
  for feedback.
- Route Xcode, iOS/macOS signing, Simulator, Keychain, universal Apple builds,
  and other host-only commands to `$task-run-ssh` automatically. Do not present
  this as a backend choice.
- Consider a container implementation only after verifying the OrbStack CLI or
  machine is genuinely unavailable or broken. Do not ask preemptively.

## Start gate

- Invoke `$task` before inspecting implementation files or planning changes to the
  target repository. Let it create the isolated local worktree.
- Read the target repo's `AGENTS.md`/`CLAUDE.md`, workflow conventions, manifests,
  lockfiles, and canonical test/build commands.
- Before asking for host, remote account, scope, storage root, runner name, or
  machine name, read durable machine context from `~/.codex/memo.md`, inspect
  the active `gh` account and runner inventory, and inspect SSH config. Reuse
  recorded values when present.
- Treat a recorded SSH target as one opaque `user@host` or SSH alias. Never
  derive its user from local `whoami`, the local home directory, or the local
  Git identity.
- Confirm the remote host uses SSH key authentication. Never store or pass a login
  password in a skill, repo, workflow, command argument, or log.
- Confirm the external storage mount exists, is writable by the remote account, and
  has enough headroom. Do not silently fall back to the internal disk.

## Route execution without prompting

- Use an OrbStack Ubuntu Linux ARM64 machine for portable build, test, lint, Docker, Android, Rust,
  Node, and backend jobs.
- Use `$task-run-ssh` on the macOS host for Xcode, iOS/macOS signing, Simulator,
  Keychain, or other host-only work. OrbStack cannot run those jobs.
- Start with one registered runner. Add more only after measurements show that
  parallel light jobs improve throughput without memory pressure. Keep a hard cap
  of three managed runners on a 16 GiB host; heavy jobs may need a lower concurrency.

## Install the runner

Enter this section only when no usable OrbStack runner exists or the user
explicitly requests runner repair/reprovisioning. First query organization and
repository runner inventories. If the existing OrbStack runner is online, do not
re-register it, recreate its machine, or ask installation questions.

Run the bundled orchestrator from a trusted admin machine:

```bash
scripts/setup-orbstack-runner.sh \
  --ssh-host <user@tailscale-host> \
  --scope org:<github-org> \
  --storage-root /Volumes/<external-volume>/<runner-root> \
  --runner-name <runner-name> \
  --machine-name github-runner \
  --labels orb,linux-arm64,heavy \
  --runner-group <selected-private-repos-group> \
  --max-runners 3 \
  --cache-max-gb 400 \
  --cache-min-free-gb 100
```

For organization scope, pre-create a runner group whose visibility is `selected`,
whose public-repository access is disabled, and which selects at least one trusted
private repository; pass it through `--runner-group`. Use
`--scope repo:<owner/repo>` for a single-repository runner. The script obtains a
short-lived registration token through the active `gh` login and streams it through
SSH and OrbStack stdin without writing it to disk. It installs an Ubuntu 24.04 ARM64 OrbStack
machine and keeps mutable runner data in a sparse ext4 filesystem on the external
disk:

- `runner-data.ext4` — external sparse filesystem for work, caches, and Docker data
- `config/` — reproducible bootstrap files; no retained registration token

Use a container-image runner only when OrbStack machines are unavailable or broken;
do not choose it merely because it is quicker to scaffold. Cache pruning runs before
and after jobs. When pruning cannot restore the configured
minimum free space in either the ext4 image or its external-volume backing store,
the pre-job hook fails closed instead of allowing disk overflow. The ext4 loop
mount uses discard so cache deletions can release sparse-image blocks. Each runner
uses its own package-cache subtree; the configured global cache cap is divided by
the managed-runner cap, preventing parallel jobs from pruning one another's cache
or multiplying the total cache budget.

The backing-store check reserves the sparse image's entire remaining possible
growth plus the configured free-space floor before every job. Runner `HOME`, work,
package caches, tool cache, temp worktrees, and Docker data therefore stay on the
external filesystem rather than the OrbStack OS disk.

## Configure the target repository

Inspect the real stack, then add the narrowest workflow that calls existing repo
commands. Do not invent replacement build scripts. Baseline:

```yaml
permissions:
  contents: read

concurrency:
  group: heavy-${{ github.repository }}-${{ github.ref }}
  cancel-in-progress: false

jobs:
  heavy:
    timeout-minutes: 60
    runs-on: [self-hosted, Linux, ARM64, orb]
```

- Prefer predefined jobs over a workflow input that executes arbitrary shell text.
- Restrict self-hosted jobs to trusted branches/events. Never execute untrusted fork
  pull-request code on a persistent runner.
- Use package-manager lockfiles and deterministic install commands.
- Let native package caches persist under the external `cache/` mount. Avoid
  `actions/cache` by default on a single persistent runner; it adds network/storage
  cost without helping local reuse. Add it only when jobs may move across runners.
- Add `timeout-minutes` and repo-appropriate `concurrency` to every heavy job.
- Upload only small, useful reports. Apply artifact retention limits.

## Agent task and review integration

- Dispatch deterministic heavy checks with `gh workflow run`, pinning a pushed ref.
- Keep code-changing agent work under `$task`; offload its expensive verification
  commands only after the relevant commit is reachable by the runner.
- When several task worktrees are active, make runner-backed portable checks the
  normal path rather than competing for local CPU, memory, and disk resources.
- Use `$task-run-ssh` when the exact command needs host macOS or when GitHub workflow
  dispatch is too rigid. Use exact commits and external-drive worktrees there too.
- Treat runner output as evidence, not as permission to skip local task lifecycle,
  two-reviewer QA, merge-back, or cleanup requirements.

## Verify

```bash
gh api orgs/<org>/actions/runners \
  --jq '.runners[] | {name,status,busy,labels:[.labels[].name]}'
gh workflow run <workflow> --ref <pushed-ref>
gh run watch
```

Verify the machine service reports `online`, the job path resolves under the external
volume, a second run reuses dependency caches, and the configured cache/free-space
limits are visible in the pre-job log. Remove an older runner only after the new
runner completes a smoke job.
