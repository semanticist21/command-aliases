# SSH transport and direction

Read when selecting a managed host's SSH transport, diagnosing policy denial,
or verifying setup after a network or identity change. The private registration
owns the required source-to-target directions and non-root management accounts.

## Identify the actual authentication path

- Tailscale SSH authenticates the source's current Tailnet identity through SSH
  policy. Verify the installed client/daemon variant, effective SSH handling and
  control-plane target identity. Do not require an unrelated OpenSSH private key.
- OpenSSH over Tailscale uses the registered device-local key and trusted server
  host key. Keep explicit identities and strict host-key checking. Its success
  does not prove that another target's Tailscale SSH policy permits the caller.

OS name, port reachability and `RunSSH` alone are not capability proof. A standalone
macOS daemon can differ from an app-packaged client. Inspect current installed
support, effective policy/listener evidence and an actual remote connection
before changing transports. Never disable Tailscale SSH or expose an OpenSSH
listener merely to bypass policy denial.

Separate DNS/routing, SSH policy, key authentication and sudo failures. A policy
rejection before key authentication is not repaired by generating another key.

## Verify the declared directions

Resolve the actual source identity or role, destination identity or role,
transport and non-root login for each required direction. A human administrator
and a tag-owned host are different sources. A destination management tag alone
does not authorize that host's outgoing SSH; a self-only rule does not cover a
different owner's device. Network packet grants and SSH login policy are distinct.

Keep policy changes within the registered desired state or explicit owner
approval. Permit only the declared management source/destination roles and login;
do not infer symmetric access, a full mesh, arbitrary tag-wide bootstrap approval,
direct root login or runner authority. A host tag is a machine identity, not a
process boundary: workloads whose traffic inherits that identity require verified
isolation before claiming they cannot use its management access.

After a tag/identity transition, verify both incoming management and every
registered outgoing dependency. An inbound path requires a distinct registered
peer; local/self SSH and local sudo do not exercise the external policy path.
Test the reverse direction only when declared. Require successful SSH and the
platform-validated isolated no-ticket sudo probe with stdout exactly `0` for each
required administrative direction. Test denied identities/logins with safe policy
fixtures or previews; do not manufacture live unauthorized devices.

Report each failed direction and phase separately. Keep valid completed paths
and unrelated service work usable, but never call the selected environment fully
ready while a required path fails. SSH success alone does not verify an application
port, service health, credential recovery or runner readiness.
