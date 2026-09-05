# Consumer repository setup

Use this path when connecting the current repository to an existing runner estate.
Do not ask whether the user means provider setup when repository workflows and the
request make consumer onboarding unambiguous.

## Discover the requirement and contract

Inspect repository policy, workflows, manifests, target artifacts, and build tools.
Derive only capabilities the job actually needs: an operating system, target
architecture, Apple toolchain, container build, service containers, cache, or an
explicit fallback. Verify GitHub authority, runner-group access, and the published
estate contract before editing `runs-on`. That contract defines which
repositories reach the estate, and a shared one is expected to reach them all;
if this repository cannot, treat it as a provider registration to repair rather
than a reason to select another runner.

Use the closed portable vocabulary and estate-identity rule in
[capability-labels.md](capability-labels.md). Capabilities are an AND contract. Use
the estate's observed common label plus its observed catalog OS, architecture, and
feature labels; never invent labels or assume an ARC scale set has the automatic
`self-hosted`, OS, or architecture labels of a classic runner. Consumer jobs must
not select hostnames, physical machines, Kubernetes, OrbStack, systemd, or another
provider implementation. Pinning is valid only for a real workload requirement and
must say why.

Prefer a runner whose native architecture matches the artifact target. An emulated
x64 fallback must publish and require an explicit fallback capability; it must not
share the normal native-x64 routing contract. Expose fallback through an intentional
workflow input or reusable-workflow branch so normal dispatch cannot race onto it.

## Add the smallest safe lane

Use least `permissions`, bounded `workflow_dispatch` inputs, timeout and concurrency,
safe checkout, deterministic non-secret caches, and no shared database or worktree
state. GitHub-hosted runners are forbidden. Public repositories and untrusted fork
events must not dispatch to self-hosted runners. An estate-wide all-private policy
is the normal shape for a shared estate, and the provider contract states it: every
private repository and every principal able to cause or approve workflow execution
are one trust domain. The contract must define private-fork policy and allowed
events and refs.

Never check out or execute an untrusted pull-request head from `pull_request_target`
on a self-hosted runner. Before a `workflow_run` or reusable-workflow call reaches a
self-hosted job, verify the originating repository, fork status, event, workflow,
and ref against the provider contract; a trusted wrapper does not make untrusted
originating code safe.

If useful, adapt `scripts/dispatch-heavy.sh` with ignored private environment
configuration. Its Actions route requires a remote ref; its SSH route is for an
explicitly authorized off-CI capability, not a substitute for runner registration.

## Verify behavior

Validate workflow YAML, dispatch a non-destructive trusted-ref smoke job, and prove
the selected capability accepted it. Verify logs, deterministic cache behavior,
workspace cleanup, timeout/concurrency behavior, and any declared artifact. Prove
that public, untrusted fork, unsafe `pull_request_target`, and untrusted indirect
workflow origins cannot queue the self-hosted job. A provider name appearing in the
workflow or a fallback receiving an ordinary job is routing failure.
