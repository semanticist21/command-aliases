---
name: environment-sync
description: Capture, restore, and reconcile a project, user machine, and managed infrastructure across macOS, Linux, and Windows when portable state or access changes.
---

# Environment Sync

Make the selected environment usable, not merely able to locate a credential.
A completed sync leaves the requested project, its common machine baseline, and
its registered infrastructure working on this machine, while keeping durable
sources ready for recovery on the next machine.

Keep portable configuration and infrastructure declarations in their canonical
Git repositories. Keep secrets and device-private material in private storage.
Never expose a secret value in chat, Git, logs, commands, manifests, or a
read-back check.

## Scope and requests

- `$environment-sync setup` explicitly registers and configures this machine as
  a shared managed host; read [environment-selection.md](references/environment-selection.md).
  For other calls, resolve personal versus organization use through that same
  reference before selecting a project or user collection. Registered shared
  hosts select their organization automatically. New ordinary machines default
  to personal; organization access requires an explicit request or a durable
  user-declared device default. Do not repeat a resolved choice.
- Accepted forms are `$environment-sync`, `$environment-sync user
  [owner-id/collection-id]`, and `$environment-sync
  [reconcile|capture|apply] [user [owner-id/collection-id]]`. Direction
  defaults to `reconcile`. With no scope, infer the selected environment from
  the current repository and registered machine state: reconcile a registered
  project when one is present, otherwise reconcile the user baseline and its
  registered default infrastructure. A leading or direction-following `user`
  explicitly forces the user baseline.
- Plain `$environment-sync` is the normal autonomous `reconcile`: select the
  applicable project or user environment, apply newer canonical state locally,
  include the current machine's registered baseline and readiness, and capture
  verified portable local improvements in their owning sources.
  `$environment-sync capture` and `$environment-sync apply` restrict direction.
- `$environment-sync` in a registered repository reconciles that canonical
  project, the registered common machine baseline, and infrastructure
  explicitly registered for that project. An unregistered repository falls
  back to the user baseline instead of being treated as a project source. It
  does not restore unrelated collections or services.
- `$environment-sync user` restores the common machine baseline, the registered
  default collection, and infrastructure registered to that machine or
  collection. `$environment-sync user
  <owner-id>/<collection-id>` selects that exact registered collection. Use it
  before a project checkout exists.
- If an otherwise registered project has no registered private collection,
  continue with the common baseline. Create an absent registration only when
  owner, scope, destination, consumer, and approved paths are unambiguous;
  create and verify its exact collection and allowlist before transfer,
  preserving every existing entry.
- After environment selection, a normal sync is autonomous. Ask only for an unavoidable OS, browser, device,
  or administrator approval, or when plausible evidence would select materially
  different owners, targets, or desired states.

## Route only to relevant detail

- For a missing bootstrap pointer, a new device identity, CLI/profile recovery,
  Tailnet access, NAS access, or managed-host readiness, read
  [machine-bootstrap.md](references/machine-bootstrap.md).
- Before inspecting an unknown ignored/private/archive candidate, or handling a
  secret, mixed input, collection, manifest, or GitHub secret/variable, read
  [private-inputs.md](references/private-inputs.md) and
  [operations.md](references/operations.md).
- For a Git host migration, stale bootstrap source, or required forge client, read
  [Git source recovery](references/git-source-recovery.md).
- For Kubernetes, runners, Git forges, NAS services, deployments, or other
  registered infrastructure, read
  [infrastructure.md](references/infrastructure.md), starting with the selected
  private baseline's linked service entrypoint rather than rediscovering hosts.
  Maintain verified canonical links there, not duplicate service configuration.
  Also read
  [operations.md](references/operations.md) before any access, secret, external
  write, deployment, or cutover. For a runner estate, also read the shared
  [runner capability catalog](../task-runner-setup/references/capability-labels.md)
  before publishing or restoring labels.

Do not load unrelated references merely because they exist.

## Sources of truth

- The registered private bootstrap repository owns the portable private common
  baseline, logical access capabilities, recovery registrations, and pointers
  to canonical sources. It owns no secret
  values or duplicated infrastructure implementation.
- A private manifest owns only integrity metadata for approved private records.
- Each project's canonical repository owns its portable configuration,
  infrastructure code, images, tests, and capability declarations. A runner
  estate owns its one exact estate label and its provider declarations and probe
  results; the shared runner catalog owns portable label strings and selectors.
  Discover and execute those declarations; do not restate package lists, label
  catalogs, resource numbers, or deployment procedures in this skill or private
  mappings.
- Live machines and services provide evidence and drift, not a second desired
  state. Reconcile them to the verified canonical declaration unless evidence
  shows that declaration is stale or two plausible states conflict.

## Reconciliation and authority

For Tailnet recovery, distinguish an approved login from membership in the
intended Tailnet. Follow the target verification and connection recovery in
[machine-bootstrap.md](references/machine-bootstrap.md) before declaring an
anchor unavailable. A wrong-network connection is recoverable environment drift,
not a successful login prerequisite or a reason to abandon reconciliation.

Inspect the selected registration, canonical source, current local and remote
state, consumers, and chronology before changing anything. Repair stale or
missing non-secret mappings when the evidence converges. A mapping or portable
configuration change is durable only after its exact Git update is committed,
pushed, and verified at the canonical remote revision.

A sync request authorizes restoring and non-destructively reconciling the
selected registered baseline on the requested machine. It does not authorize a
new architecture, unrelated service, remote deletion, org-wide policy change,
credential rotation, or infrastructure cutover that is not already the
registered desired state or explicitly requested. Never infer a target from one
filename, live process, hostname, or ambient identity.

When the private baseline explicitly classifies the current machine or a
selected target as a shared managed automation host, non-interactive
administrative elevation for its dedicated management account is required
desired state. Reconcile and verify that capability through the registered
platform procedure; do not infer shared-host status, extend it to a personal
workstation, expose it to a runner workload, or enable direct root login.

When invoked after toolkit synchronization, first resolve personal or organization
use, then select the applicable registered project or user environment and include
every toolkit-critical baseline target belonging to that selected environment.
This contextual addition does not force the
whole user scope or omit an applicable project. Do not invoke `toolkit-sync`
again or modify toolkit-managed public sources or runtime copies. Finish that
environment phase independently and report partial readiness.

Promote a local fact only when it is verified, portable, and non-secret. Write
the generalized declaration to its owning source; never copy or synchronize
`AGENTS.local.md`. Resolve conflicts from chronology, consumers, and behavior
when they prove one desired state. Preserve both and ask about only that item
when two divergent states remain valid.

## Completion

Finish only after resolved inputs are usable, requested services match their
canonical declarations, and every required non-destructive connection and
behavior probe succeeds. Verify observable behavior, not mere installation or
resource existence. A healthy source machine must also reconcile current state
so another machine can recover it. Report any survivor or unavailable approval
explicitly; never call partial restoration complete.

When changing this skill's behavior, use the value-free forward cases in
[verification-scenarios.md](references/verification-scenarios.md); do not turn
them into wording-match tests.
