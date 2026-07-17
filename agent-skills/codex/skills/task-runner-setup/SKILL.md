---
name: "task-runner-setup"
description: "Connect a repository to the existing OrbStack Linux ARM64 GitHub Actions runner, with external-disk caches and direct-SSH routing for macOS-only work. Use for runner workflow design, cache design, or remote task/review preparation."
---
# Task Runner Setup

Build a repeatable remote-job path without turning the developer machine into an
unbounded cache or exposing credentials. The runner backend is fixed; a repository
owns its workflow names, job boundaries, and when it uses the runner.

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

During multi-worktree work, use the runner for portable work that is expensive enough
to contend for local CPU, memory, or disk; keep quick focused checks local for feedback.
Start with one registered runner and add more only after measurements show useful
throughput without memory pressure — hard cap three managed runners on a 16 GiB host.

## Discover and set up autonomously

Treat an invocation as authorization to inspect the current repository and configure the
appropriate runner integration. Do not respond with a menu asking for a repository,
workflow range, preflight-vs-execution choice, or runner backend when those are
discoverable from the current checkout, git remote, repository settings, and existing
workflows.

- Resolve the current Git repository and its GitHub owner/name from `origin` or `gh repo
  view`, then invoke `$task` before inspecting implementation or workflow files.
- Reuse the recorded runner, host, storage, and scope facts when available. Select the
  narrowest integration that fits the discovered commands; extending an existing workflow
  is as valid as creating a new focused one.
- Perform safe prerequisite checks and then carry out the requested setup. An explicit
  request to migrate/configure means execution, not a request to choose between a dry run
  and execution.
- Ask only when no target can be discovered, two plausible targets or destinations have
  materially different consequences, credentials/permissions are unavailable, or an
  irreversible external action is not explicitly authorized. State the exact blocker,
  not a generic intake question.

## Coordinated migration handoff

When `$org-kobbokkom-repo-migration` is explicitly invoked in the same task, consume its
verified `Kobbokkom/<name>` destination and immutable repository ID. Configure that
destination after migration succeeds, even if the local `origin` intentionally still
points at the former owner. Do not stop after discovery, request the target again, or
offer workflow choices: select the narrowest safe setup from the transferred repository's
actual stack and existing CI.

Before the setup lifecycle proceeds, verify the destination repository ID with `gh api`
and add a task-scoped named remote pointing to that verified destination. From then on,
fetch/reconcile the destination base, push the setup branch, and create/check/merge the
PR through that named remote and `gh --repo Kobbokkom/<name>`. Dispatch and inspect the
smoke run through the same destination. Never let `$task` fall back to the former
`origin`, and never rewrite that `origin`; remove only the task-scoped remote created by
this task after the destination merge and cleanup are verified.

## Agent review and QA

For a runner setup that changes repository or runner state, completion requires the
normal verification plus two independent read-only reviewer passes:

1. **Safety reviewer:** validate trusted events, self-hosted runner labels, permissions,
   concurrency/isolation, and absence of secret exposure.
2. **Behavior reviewer:** validate the chosen workflow against the repository commands,
   inspect its completed smoke run, and check cache reuse without shared-state leakage.

P0–P2 findings block completion. Fix them, re-run the relevant smoke/verification, then
re-review. When paired with migration, use the migration skill's exactly two shared
reviewers and combined final evidence; do not add duplicate reviewer passes.

## Start gate

- Invoke `$task` before inspecting implementation files or planning changes to the target
  repository. Let it create the isolated local worktree.
- After `$task` creates the isolated worktree, read the target repo's `AGENTS.md`/
  `CLAUDE.md`, workflow conventions, manifests, lockfiles, and canonical test/build
  commands there.
- Before concluding a host, remote account, scope, storage root, runner name, or machine
  name is unavailable: read the recorded machine context under `~/.agents/doc/`
  (`AGENTS.md` is the ownership map; runner and host facts live in `infra.md`), inspect
  the active `gh` account and runner inventory, and inspect SSH config. Reuse recorded
  values when present.
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
~/.codex/skills/task-runner-setup/scripts/setup-orbstack-runner.sh \
  --ssh-host <user@tailscale-host> \
  --scope org:<github-org> \
  --storage-root /Volumes/<external-volume>/<runner-root> \
  --runner-name <runner-name> \
  --machine-name github-runner \
  --labels orb,linux-arm64 \
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

Inspect the real stack, then extend an existing workflow or add one or more workflows
whose names and job boundaries express the repository's purpose. Do not require a
`heavy` workflow, a single catch-all job, or runner use for every check. Call existing
repo commands; do not invent replacement build scripts.

- Keep runners explicit for jobs that need them:
  `runs-on: [self-hosted, Linux, ARM64, orb]`. Give each such job a timeout.
- Prefer predefined jobs over a workflow input that executes arbitrary shell text.
- Restrict self-hosted jobs to trusted branches/events. Never execute untrusted fork
  pull-request code on a persistent runner.
- Use package-manager lockfiles and deterministic install commands.
- Let native package caches persist under the external `cache/` mount. Avoid
  `actions/cache` by default on a single persistent runner — it adds network/storage cost
  without helping local reuse. Add it only when jobs may move across runners.
- Upload only small, useful reports under artifact retention limits.

### Parallel-safe workflow contract

Different workflows may run in parallel. Design each job so retries and overlapping
refs are safe, rather than serializing everything by default.

- Make check jobs read-only and commit-pinned: consume the checked-out SHA, explicitly
  clean the persistent runner's checkout before use, and use a job-unique scratch path.
  Emit reports/artifacts named with the workflow, SHA, run ID, and attempt. Do not write
  shared checkout paths or a mutable `latest` artifact.
- Scope mutable temporary files, ports, containers, and remote worktrees by run/job
  identity; clean them with ownership-aware cleanup. Key reusable dependency caches by
  immutable inputs (OS, architecture, tool version, and lockfile), and ensure their
  access is concurrency-safe. Treat caches as disposable accelerators, never as the
  source of truth.
- Use atomic publish/replace operations for a single logical result. A retry must either
  observe the already-complete result for the same immutable input or safely recreate it.
- For a job that changes shared state (release metadata, deployment slot, tag, issue,
  external test account, or a named artifact), choose one: make the target immutable per
  SHA, guard it with a narrowly scoped `concurrency.group`, or use the destination's
  lock/idempotency key. The group should identify that shared resource, not a generic
  `heavy` lane.
- Set `cancel-in-progress: false` for writers unless the operation has a proven
  cancellation/rollback path. Read-only superseded checks may opt into cancellation.
- Keep side effects behind explicit trusted refs, environments, or approvals. Re-running
  the same commit must not create duplicate releases, comments, shared uploads, or
  deployments. Per-run diagnostic artifacts are the intentional exception.

Illustrative writer serialization for one shared preview environment:

```yaml
concurrency:
  group: preview-shared-${{ github.repository }}
  cancel-in-progress: false
```

## Agent task and review integration

- Dispatch a repository-selected deterministic workflow with `gh workflow run`, pinning
  a pushed ref. Keep code-changing agent work under `$task`, and offload expensive
  portable verification only after the relevant commit is reachable by the runner.
- When several task worktrees are active, use runner-backed portable checks where they
  prevent local CPU, memory, or disk contention; this is a routing decision, not a
  required CI shape.
- Use `$task-run-ssh` when the command needs host macOS or when workflow dispatch is too
  rigid. Use exact commits and external-drive worktrees there too.
- Treat runner output as evidence, not as permission to skip the local task lifecycle,
  two-reviewer QA, merge-back, or cleanup requirements.

## Verify

```bash
gh api orgs/<org>/actions/runners \
  --jq '.runners[] | {name,status,busy,labels:[.labels[].name]}'
gh workflow run <selected-workflow> --ref <pushed-ref>
gh run watch
```

Verify the machine service reports `online`, the job path resolves under the external
volume, a second run reuses dependency caches, and the configured cache/free-space
limits are visible in the pre-job log. Remove an older runner only after the new runner
completes a smoke job.
