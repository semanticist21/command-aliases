# Runner provider setup

Use this path for a runner host, runner group, scale set, backend, new estate, or
provider registration. `task-runner-setup` owns the user-facing setup flow;
`$environment-sync` owns infrastructure mutation and recovery from the registered
canonical estate.

## Select an implementation deliberately

For a new provider, inventory the requested workloads, target architectures,
available hardware, existing estate, GitHub scope, and isolation needs. Then ask one
focused implementation question and include a recommendation. Offer:

- Kubernetes with Actions Runner Controller;
- a native Linux service;
- a native macOS service;
- a VM implementation such as OrbStack; and
- another implementation already registered by the estate.

Kubernetes is never an implicit default. Do not infer the implementation from the
host OS, a package, an idle runner listing, or a nearby configuration file. Once the
user selects it, pass the choice and discovered owner, scope, target, consumer, and
canonical-source evidence to `$environment-sync`. It owns creating and verifying an
unambiguous registration and canonical declaration before any host, cluster,
service, storage, access, or recovery mutation. If those registration inputs do not
converge, ask only for the unresolved item and make no infrastructure change.

When reconciling an existing registered provider, preserve its declared
implementation and do not ask again. A missing or inaccessible canonical source is
a recovery blocker, not evidence for a different backend. Ask implementation again
only when valid registrations conflict or the user explicitly requests a change. A
backend change is a canary, drain, cutover, and rollback operation rather than an
in-place guess.

After the implementation is selected or resolved from registration, read the
applicable section of [runtimes.md](runtimes.md) before planning provider mutation.

## Publish a capability contract

Publish only labels allowed by the closed portable vocabulary and estate-identity
rule in
[capability-labels.md](capability-labels.md). Every backend publishes the canonical
estate label, one catalog OS label, one catalog native-architecture label, and only
the optional capability labels whose probes pass. The canonical estate owns its
exact common label; this catalog owns every portable OS, architecture, and feature
label. Provider implementation names, hostnames, and physical machine names are
inventory, not consumer labels.

An emulated x64 provider declares emulation and fallback explicitly and does not
claim the native-x64 contract. Kubernetes/ARC, native Linux, native macOS, and VM
backends are interchangeable only when the same capability probes pass; backend
identity alone proves nothing.

## Establish authority and lifecycle

Before mutation, verify authenticated GitHub scope and the exact permissions needed
to read and manage runners and runner groups. Never register or alter organization-
wide runners from ambient identity or implication. Record repository access policy,
public-repository prohibition, runner group, concurrency/capacity, lifecycle,
cleanup, logs, and recovery in the canonical estate.

Register a shared estate for every private repository in its owner. Narrow to
selected repositories only when a stated requirement demands separation, and name
what that group separates and why. Scoping first fails quietly: a job whose labels
no runner answers never starts, so `timeout-minutes` never fires, and the queue
limit cancels it hours later without naming a cause. Widening an already narrow
group is a scope change on existing infrastructure and needs the same explicit
request as any other.

Org-wide reach is still an explicit trust decision, and declaring it does not soften
what it grants: every user, app, bot, collaborator, or other principal able to cause
or approve workflow execution in that scope can exercise the provider. The canonical
contract must declare private-fork policy and allowed events and refs. Even then,
public repositories and untrusted direct or indirect fork workflows remain forbidden.
Use ephemeral isolation where declared; long-lived providers require workspace/cache
cleanup and reboot recovery probes.

Apply through `$environment-sync`, publish the capability contract, then dispatch
trusted smoke jobs for every declared capability. Verify assignment, logs, cache and
workspace cleanup, failure cleanup, return to idle or ready state, and restoration
from the canonical declaration. Do not call registration alone complete.
