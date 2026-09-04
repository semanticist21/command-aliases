# Registered infrastructure

Read this reference for Kubernetes, Actions runners, GitLab, NAS services,
deployments, or any other service whose desired state must survive a machine
replacement. Read [operations.md](operations.md) before secrets, remote access,
external writes, deployments, or cutovers.

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
`task-runner-setup`; it does not own the runner implementation. The runner
estate must publish and test the labels or scale-set names that consumers use.
Discover that contract from the canonical estate and actual GitHub
configuration. Do not hardcode one user's labels in this general skill, invent
automatic `self-hosted`/OS/architecture labels, or call a scale-to-zero set
absent because no runner is currently listed.

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

GitLab or another future service enters this sync only after its canonical
repository, target, public configuration, private inputs, backup contract,
health probe, and recovery/cutover authority are registered. Do not infer a
production topology or install a service merely because a package, hostname, or
old volume exists.

## Completion

Verify behavior at the service boundary: authenticated health, intended
consumer routing, applicable storage and restore or clean recreation, failure
cleanup, and declared idle or ready state. Record only current mappings and
desired declarations; do not create migration journals or duplicate operational
state.
