# Registered infrastructure

Read this reference for Kubernetes, Actions runners, Git forges, NAS services,
deployments, or any other service whose desired state must survive a machine
replacement. Read [operations.md](operations.md) before secrets, remote access,
external writes, deployments, or cutovers.

## Discover the registered services

Start at the selected private bootstrap repository's entry document and follow
its infrastructure links. Keep one discoverable index there (inline or linked)
mapping registered service roles to their canonical repository and exact
declaration, consumer contract, and recovery entrypoints where applicable.
Use existing owning documents instead of creating a parallel inventory. Verify
repository identity, access and target paths at the remote revision before
adding or repairing links. Concrete internal URLs belong only in private
registration, never the public toolkit or public shared user context.

Follow only services selected by the environment/project registration; an index
is discovery, not authorization to probe or reconcile every listed service.
Repair missing or stale links from convergent registration and canonical
evidence, with the normal committed/pushed mapping procedure. Preserve unresolved
targets and report the exact inaccessible source rather than guessing hosts or
creating a replacement. Keep labels, capacity, deployment state and probe
results in their owning declarations/tests, not copied into the index.

For runners, follow the consumer contract before choosing routing or claiming
availability. Registration or an idle scale-to-zero set does not prove that a
repository is admitted or that a workload capability has passed. Distinguish
the public skill source, private declaration repository, bootstrap snapshot
publisher and secret archive; a link update does not migrate any of them.
Report the verified private entrypoint after reconciliation so subsequent tasks
can use it without reconstructing infrastructure from conversation history.

## Reconcile declarations, not memories

Resolve the infrastructure registration to one canonical Git repository and
verify its remote revision before applying it. That repository must own
the applicable portable declarations: manifests or service configuration,
versions or immutable digests, capability tests, and safe install or upgrade
automation. Helm values and image builds are required only when that service
uses Helm or custom images. Stateful services need a backup and restore
declaration; a stateless service records explicitly that it has no durable state
to restore. The private bootstrap source owns only the non-secret pointer,
target mapping, consumer, and recovery contract; the private archive owns
required values.

Inventory live state to detect drift, but never promote hand-edited live state
to desired state without resolving its provenance. Do not copy an old runtime
database, container store, Kubernetes data directory, or opaque host filesystem
onto a replacement machine when declarative recreation plus a registered backup
exists.

A sync may install or reconcile the registered desired state on the selected
machine. Architecture changes, service replacement, remote deletion, DNS or
organization-policy changes, and cutovers require explicit authority unless the
exact action is already part of the selected registered recovery contract.
Drain work and preserve a tested rollback before replacing an active service.

## Kubernetes and runner estates

Keep each runner estate's actual supervisor or orchestrator declarations,
applicable machine or container images, capability contract, and smoke tests in
its canonical repository. For a Kubernetes estate, that includes cluster
installation and controller charts or manifests; for systemd, Quadlet, VM, or
another implementation, keep the equivalent native declarations instead of
inventing Kubernetes artifacts or images the implementation does not use.
On a new machine, restore the registered implementation configuration and
authentication inputs, then deploy from that repository. Pin applicable charts
and images to reviewed versions or immutable digests; do not reconstruct them
from shell history.

A consumer repository uses the runner capability selected by
`task-runner-setup`; it does not own the runner implementation. The same setup
skill is also the user-facing entrypoint for a new provider: it must ask which
implementation to use before mutation, then hand the selected host, cluster,
service, storage, and recovery work to `environment-sync`. Reapplying a
registered estate preserves its canonical implementation without asking again
unless evidence conflicts or the user requests a change.

The runner estate must publish and test a backend-neutral contract containing a
common estate label, OS, architecture, and applicable workload capabilities. Read
the shared
[runner capability catalog](../../task-runner-setup/references/capability-labels.md)
before publishing, restoring, or validating labels. The canonical estate owns one
exact machine-readable estate label, with no aliases, plus its provider
declarations and capability probe results. The shared catalog owns every portable
OS, architecture, capability, and selector string. Scale-set names remain canonical
estate inventory and are not consumer labels. Cross-check the canonical declaration
and actual GitHub configuration against the catalog; reject unknown portable labels
instead of preserving or approximating them. Do not expose provider implementations
or physical machines as consumer routing, invent automatic
`self-hosted`/OS/architecture labels, or call a scale-to-zero set absent because no
runner is currently listed.

Creating, rebuilding, or recovering a runner host, cluster, VM, service,
cache/storage layout, or runner group is an `environment-sync` infrastructure
operation. For an existing provider, resolve and verify its registered canonical
runner-estate repository first; an unavailable source blocks recovery and never
authorizes backend reselection. For a new provider whose implementation has been
explicitly selected, `environment-sync` owns creating and verifying the exact
registration and canonical declaration when owner, scope, target, consumer, and
repository all converge. Ask only for an unresolved input and perform no
infrastructure mutation until registration and declaration are verified. Bundled
assets under `scripts/runner-estate/` are migration aids for that registered source,
not authority for an ad hoc live-host installation.
`task-runner-setup` orchestrates both modes: it owns consumer workflow,
capability selection, dispatch, and smoke verification; for providers it owns
mode and implementation selection while `environment-sync` owns infrastructure
mutation and recovery.

Kubernetes is one implementation, never an inferred default. A new provider
choice may instead be a native Linux service, native macOS service, VM, or
another registered implementation. Preserve a registered implementation during
recovery. Treat a requested implementation change as an architecture/cutover
decision with isolated canary, drain, rollback, and explicit retirement.

Repository access is part of the provider contract. A shared estate serves its
whole owner; an all-private policy is its normal shape, declared as one trust
domain with the broad authority of every principal able to cause or approve
workflow execution accepted. Narrowing is the exception and names what it
separates. The
canonical contract must define private-fork policy and allowed events and refs.
Public repositories and untrusted direct or indirect fork workflows remain
forbidden for every implementation.

For an Actions Runner Controller deployment, verify at least:

- the registered GitHub repository/organization/enterprise scope, runner group,
  scale-set identity, and min/max policy;
- controller/listener isolation, least-privilege service accounts, and protected
  ARC/GitHub authentication secrets;
- assignment from an intended consumer, failure cleanup, and return to the
  declared idle count;
- the ARC entrypoint/layout and image-pull behavior when a custom image is
  declared;
- private-image credentials and pull paths only when that custom image is
  private;
- only the workload capabilities declared by the canonical estate, such as
  container jobs, service containers, image builds, target architecture, cache,
  or resource isolation; and
- the canonical estate's registered, proportionate capacity or concurrency test
  rather than an invented maximum-load run.

Packages, root/rootless mode, nested Podman or Docker behavior, cgroup rules, and
resource budgets belong in the applicable image and native supervisor or
orchestrator declarations, backed by executable capability tests. Do not
restate them here. Do not leave old and new listeners competing for the same
jobs: canary the replacement under an isolated identity, drain the incumbent,
cut over once, verify routing and cleanup, then remove only the explicitly
retired implementation.

## Storage, NAS, and backups

Use local supported storage for live cluster state, container layers, ephemeral
runner workspaces, and latency-sensitive databases unless the canonical service
declares otherwise. A NAS is suitable for registered backups and durable
artifacts; mounting a broad NAS share into an untrusted or privileged runner
turns workflow code into NAS authority. Use a dedicated least-privilege share,
read-only access when possible, and an explicit consumer.

A stateful recovery is incomplete until a value-free restore check proves that
the registered backup, declaration, keys, versions, and target mapping are
sufficient. For a declared stateless service, prove clean recreation and
readiness instead. A backup upload or mounted share alone is not a restore test.

## Other managed services

GitLab, Forgejo or another managed service enters this sync only after its canonical
repository, target, public configuration, private inputs, backup contract,
health probe, and recovery/cutover authority are registered. Do not infer a
production topology or install a service merely because a package, hostname, or
old volume exists.
For repository-source and account-access changes, follow
[Git source recovery](git-source-recovery.md); do not infer an Actions provider
cutover merely from moving Git repositories.

## Completion

Verify behavior at the service boundary: authenticated health, intended
consumer routing, applicable storage and restore or clean recreation, failure
cleanup, and declared idle or ready state. Record only current mappings and
desired declarations; do not create migration journals or duplicate operational
state.
