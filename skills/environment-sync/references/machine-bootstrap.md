# Machine bootstrap and access

Read this reference when the local bootstrap pointer is absent, a machine is new
or repaired, or CLI, device identity, NAS, Tailnet, or managed-host access must
be restored.

## Bootstrap discovery

`~/.agents/doc/AGENTS.local.md` is the stable pointer to the registered private
bootstrap repository. A completed setup must leave a registered, continuously
available Tailnet access anchor usable by a newly joined macOS, Linux, or Windows
machine. Do not make recovery depend on one workstation remaining online.

When the pointer is absent, resolve the active installed `environment-sync`
skill directory first; do not assume the current working directory is the skill
directory. Invoke the bundled client by its resolved absolute path rather than
constructing a raw request or asking the user to copy a pointer:

- macOS/Linux: `sh <environment-sync-skill-dir>/scripts/bootstrap.sh bootstrap`
- Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File
  <environment-sync-skill-dir>/scripts/bootstrap.ps1 bootstrap`

The client discovers exactly one online peer tagged
`tag:secrets-sync-anchor`, uses authenticated Tailnet state and the stable local
device ID, rejects redirects and ambiguous or untagged responders, restores the
verified owner-only bootstrap snapshot, creates or reuses a fresh local Ed25519
device key, and enrolls only its public key. The `enroll`, `rotate`, and
`revoke` actions use the same device-bound contract.

The deny-by-default anchor exposes only the fixed
`/.well-known/secrets-sync`, `/v1/bootstrap.tar.gz`, and `/v1/enroll` contract.
It may return the verified secret-free snapshot and enroll one bare
`ssh-ed25519` public key. Bind its fingerprint to the authenticated stable
device ID, keep at most one anchor-managed active key per device, and make
replace and revoke atomic and idempotent. Reject private keys, copied device
keys, comments, other key types, ambient SSH identities, non-Tailnet callers,
and manual account or browser login. Never expose archive values or credentials.

The `secrets-sync` tag, HTTPS path, key filename, marker names, and client
messages are stable wire and on-disk protocol identifiers retained for backward
compatibility; the user-facing skill name is `environment-sync`.

Treat reachability and authorization separately. Tailnet membership is the only
pre-existing machine trust for portable bootstrap, but reachability alone is not
file or shell access. The anchor must authenticate and authorize the device
against a deny-by-default policy, bind its stable device ID to the connection,
and expose no archive value or credential. Never substitute an ambient SSH
identity, copied private key, guessed account, or manual pointer.

## Machine recovery

Restore or install only registered CLI configuration, profiles, and connection
paths. Prefer a registered durable, revocable access key over a temporary
credential when the provider permits it. Generate device keys locally and enroll
them through the declared recovery action; never copy another device's SSH
private key or Keychain dump.

Restore every selected registered managed-host profile before probing it. These
may include VPS, Mac mini, NAS operator and restricted-transfer, and workstation
profiles; the registration, not this list, selects the actual targets. For each
profile verify its configured identity, authentication and authorization, and
non-destructive readiness check. A resolvable hostname, reachable port, ambient
login, or guessed target is not proof that the registered profile works. Repair
NAS operator and restricted-transfer paths independently and leave unrelated or
unregistered hosts untouched.
macOS cannot serve Tailscale SSH; OS-specific SSH is a later managed-host path,
not the portable bootstrap contract.

An unavoidable browser, OS, device, or administrator confirmation may pause the
work. Request only that exact approval and continue afterward.

## Verification

Use clean pointer-free fixtures, or equivalent value-free checks, for macOS,
Linux, and Windows. Prove snapshot validation, fresh public-key enrollment,
device binding, rotation, revocation, safe resume after enrollment failure, and
refusal to overwrite existing local state. Linux needs Python 3 or `jq`; macOS
may use its built-in JXA JSON parser; Windows uses `ConvertFrom-Json` and needs
OpenSSH Client only when `ssh-keygen.exe` is absent.
