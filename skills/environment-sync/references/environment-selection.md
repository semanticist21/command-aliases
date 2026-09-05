# Environment selection and shared-host setup

Read for personal/organization selection, explicit `setup`, or an authorized
Tailnet migration. Concrete network identities and access material remain in
private registration/archive; public instructions never hardcode an owner.

## Select the environment

A registered shared managed host selects its organization environment on normal
calls. An ordinary machine asks personal or organization once per invocation
unless the current request already specifies the choice. Recommend personal for
a new ordinary machine; explicit device placement and default-profile decisions
override that recommendation. Never infer shared-host status from an OS, login,
active network, server package, or an ordinary organization-use selection.

Resolve project/user scope and selected collections within that environment.
Personal sync must not pull organization secrets, require its anchor, switch to
its network, or probe its critical servers unless explicitly requested. Missing
registration still requires trusted owner context; personal selection does not
authorize a guessed collection. Additional organization access on an ordinary
machine adds a profile only when requested and never grants host-management sudo.
After toolkit sync, use these same selection rules and only the chosen baseline's
critical targets. Report public runtime readiness separately.

Multiple saved profiles do not mean simultaneous network attachment. Maintain
the declared active default and preserve alternate profiles; do not bridge
networks. Inspect current state, saved profiles, and any pending login before
starting authentication. Reuse an existing valid flow, distinguish browser
account authentication from device approval, and verify the resulting active
network. See [machine-bootstrap.md](machine-bootstrap.md) for target recovery.

## Explicit setup

`setup` is an explicit request to make the current machine a shared managed host,
not an executable system command or a request to install runner infrastructure.
Resolve the approved organization, dedicated management account, machine identity,
canonical private registration, and recovery path. Use convergent existing
evidence; ask only for unresolved material inputs. Record the role and declared
target before privileges or remote consumers depend on it. An incomplete setup
must remain incomplete in registration and must not advertise readiness.

Restore/install the registered supported Tailscale client as explicitly authorized
by setup, using its platform procedure, and complete unavoidable authentication.
Register the organization profile and default. Generate device keys locally and
enroll only public keys. Establish platform-supported Tailscale SSH, or OpenSSH
restricted to the Tailscale access boundary. Preserve known-good access until
the replacement works; test public/LAN exposure as applicable before closing an
existing path. Apply the rollback-safe dedicated-account sudoers transaction in
[machine-bootstrap.md](machine-bootstrap.md), then prove SSH identity and isolated
no-ticket sudo from a registered client and locally. No direct root SSH or
runner credentials, sockets, or elevation is created by setup.

Capture only portable role/baseline declarations to canonical private Git;
concrete network/account/host/key material belongs in the registered private
archive. Keep the local overlay local. Re-running setup reconciles these same
resources without duplicate profiles, keys, policies, or registrations.

## Authorized network migration

Before moving a host, inventory network-dependent SSH profiles, Serve/Funnel,
DNS/certificates, exit routes, service consumers, and the bootstrap anchor.
Preserve private rollback state and verify a local or independent continuation
path before changing the network carrying the management session. Migrate one
host at a time. Update registered addresses, device bindings, approved users,
service exposure, and snapshot consumers; old device IDs and URLs may not survive.

Prepare destination policy and owner memberships first, then a management
client, then the anchor and remaining hosts. Do not require a destination anchor
to bootstrap itself: use the already verified source operator path and private
declaration. Verify destination anchor discovery, snapshot, enrollment and
watchdog before relying on it for further recovery. Preserve logical bootstrap
contracts; do not copy other machines' private keys.

Only retire exact old device registrations after new access and dependent
services pass. Explicit unused-device removals remain separate from deleting
their containers or data. Offline or ambiguous devices remain pending, not
silently removed or declared migrated. Verify both approved login identities
where required; one account succeeding is not evidence for the other.
