---
name: environment-sync
description: Restore and reconcile a registered project, user machine, and managed infrastructure across macOS, Linux, and Windows. Use on a new or repaired machine, after recovery fails, or when configuration, credentials, access, deployment inputs, or declared infrastructure change.
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

- `$environment-sync` in a repository reconciles that canonical project, the
  registered common machine baseline, and infrastructure explicitly registered
  for that project. It does not restore unrelated collections or services.
- `$environment-sync user` restores the common machine baseline, the registered
  default collection, and infrastructure registered to that machine or
  collection. `$environment-sync user
  <owner-id>/<collection-id>` selects that exact registered collection. Use it
  before a project checkout exists.
- If a project has no registered private collection, continue with the common
  baseline. Create an absent registration only when owner, scope, destination,
  consumer, and approved paths are unambiguous; create and verify its exact
  collection and allowlist before transfer, preserving every existing entry.
- A normal sync is autonomous. Ask only for an unavoidable OS, browser, device,
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
- For Kubernetes, runners, GitLab, NAS services, deployments, or other
  registered infrastructure, read
  [infrastructure.md](references/infrastructure.md). Also read
  [operations.md](references/operations.md) before any access, secret, external
  write, deployment, or cutover.

Do not load unrelated references merely because they exist.

## Sources of truth

- The registered private bootstrap repository owns non-secret mappings,
  recovery registrations, and pointers to canonical sources. It owns no secret
  values or duplicated infrastructure implementation.
- A private manifest owns only integrity metadata for approved private records.
- Each project's canonical repository owns its portable configuration,
  infrastructure code, images, tests, and capability contracts. Discover and
  execute those declarations; do not restate package lists, labels, resource
  numbers, or deployment procedures in this skill or private mappings.
- Live machines and services provide evidence and drift, not a second desired
  state. Reconcile them to the verified canonical declaration unless evidence
  shows that declaration is stale or two plausible states conflict.

## Reconciliation and authority

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
