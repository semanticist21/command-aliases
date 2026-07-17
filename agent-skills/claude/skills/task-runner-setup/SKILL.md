---
name: "task-runner-setup"
description: "Connect a repository to the existing OrbStack Linux ARM64 GitHub Actions runner by default, with external-disk caches and automatic direct-SSH routing for macOS-only work. Use for repo-specific heavy CI offload, runner workflow setup, cache design, or worktree-based remote task/review preparation. Do not ask the user to choose a runner backend when an existing OrbStack runner is available."
---
# Task Runner Setup

Build a repeatable heavy-job path without turning the developer machine into an
unbounded cache or exposing credentials.

## Routing is fixed — do not ask

The backend is already decided. Never ask which runner implementation, image,
container, VM, or host type to use, and never present the split below as a choice.

- **Portable work → the existing OrbStack Ubuntu Linux ARM64 machine.** Build, test,
  lint, Docker, Android, Rust, Node, and backend jobs. Reuse an online runner labeled
  `orb`, `Linux`, and `ARM64`; when one exists, skip provisioning entirely and configure
  only repository access and workflows.
- **Host-only work → `$task-run-ssh` on the macOS host.** Xcode, iOS/macOS signing,
  Simulator, Keychain, and universal Apple builds. OrbStack cannot run these.
- **A container implementation** is a last resort, only after verifying the OrbStack CLI
  or machine is genuinely unavailable or broken.

During multi-worktree work, prefer the runner for portable heavy jobs to keep load off
the local machine; keep quick focused checks local for feedback. Start with one
registered runner and add more only after measurements show parallel light jobs improve
throughput without memory pressure — hard cap three managed runners on a 16 GiB host,
and heavy jobs may need lower concurrency.

## Start gate

- Invoke `$task` before inspecting implementation files or planning changes to the target
  repository. Let it create the isolated local worktree.
- Read the target repo's `AGENTS.md`/`CLAUDE.md`, workflow conventions, manifests,
  lockfiles, and canonical test/build commands.
- Before asking for a host, remote account, scope, storage root, runner name, or machine
  name: read the recorded machine context under `~/.agents/doc/` (`AGENTS.md` is the
  ownership map; runner and host facts live in `infra.md`), inspect the active `gh`
  account and runner inventory, and inspect SSH config. Reuse recorded values when present.
- Treat a recorded SSH target as one opaque `user@host` or SSH alias. Never derive its
  user from local `whoami`, the local home directory, or the local Git identity.
- Confirm the remote host uses SSH key authentication. Never store or pass a login
  password in a skill, repo, workflow, command argument, or log.
- Confirm the external storage mount exists, is writable by the remote account, and has
  enough headroom. Do not silently fall back to the internal disk.

## Install the runner

Enter this section only when no usable OrbStack runner exists or the user explicitly
requests runner repair/reprovisioning. First query the organization and repository
runner inventories. If the existing OrbStack runner is online, do not re-register it,
recreate its machine, or ask installation questions.

Run the bundled orchestrator from a trusted admin machine:

```bash
~/.claude/skills/task-runner-setup/scripts/setup-orbstack-runner.sh \
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

For organization scope, pre-create a runner group whose visibility is `selected`, whose
public-repository access is disabled, and which selects at least one trusted private
repository; pass it through `--runner-group`. Use `--scope repo:<owner/repo>` for a
single-repository runner.

What the script already guarantees, so you need not hand-verify it:

- The short-lived registration token comes from the active `gh` login and streams through
  SSH and OrbStack stdin, never touching disk. `config/` keeps reproducible bootstrap
  files and no retained token.
- It installs an Ubuntu 24.04 ARM64 OrbStack machine and puts every piece of mutable
  runner data — `HOME`, work, package caches, tool cache, temp worktrees, Docker — on
  `runner-data.ext4`, a sparse ext4 filesystem on the external disk rather than the
  OrbStack OS disk. The loop mount uses `discard` so deletions release sparse blocks.
- Cache pruning runs before and after every job. Each runner gets its own package-cache
  subtree and the global cache cap is divided by the managed-runner cap, so parallel jobs
  neither prune one another's cache nor multiply the budget.
- The pre-job backing-store check reserves the sparse image's entire remaining possible
  growth plus the free-space floor, and fails closed when pruning cannot restore the
  minimum free space in either the ext4 image or its backing store.

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
  `actions/cache` by default on a single persistent runner — it adds network/storage cost
  without helping local reuse. Add it only when jobs may move across runners.
- Give every heavy job a `timeout-minutes` and repo-appropriate `concurrency`, and upload
  only small, useful reports under artifact retention limits.

## Agent task and review integration

- Dispatch deterministic heavy checks with `gh workflow run`, pinning a pushed ref. Keep
  code-changing agent work under `$task`, and offload its expensive verification commands
  only after the relevant commit is reachable by the runner.
- When several task worktrees are active, make runner-backed portable checks the normal
  path rather than competing for local CPU, memory, and disk.
- Use `$task-run-ssh` when the command needs host macOS or when workflow dispatch is too
  rigid. Use exact commits and external-drive worktrees there too.
- Treat runner output as evidence, not as permission to skip the local task lifecycle,
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
limits are visible in the pre-job log. Remove an older runner only after the new runner
completes a smoke job.
