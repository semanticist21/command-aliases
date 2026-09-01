---
name: secrets-sync
description: Restore and synchronize a project's inputs plus the machine access needed to use them across macOS, Linux, and Windows machines. Use on a new or repaired machine, after clone/worktree recovery fails, or when configuration, credentials, or deployment inputs change.
---

# Secrets Sync

Make a machine ready to work, not merely able to find a secret. A successful
sync leaves the requested project and its registered common machine baseline
usable on this machine, and leaves durable sources ready for the next machine.

Keep ordinary, portable configuration in Git. Keep only secrets and
device-private material in private storage. Never expose a secret value in
chat, Git, logs, commands, manifests, or a read-back check.

## Requests and outcome

- `$secrets-sync` in a repository reconciles that canonical project and its
  registered common machine baseline: required inputs, CLIs, profiles, device
  identity, NAS access, and managed-host access. It does not restore unrelated
  project collections.
- `$secrets-sync user` restores the common machine baseline plus the registered
  default collection. `$secrets-sync user <owner-id>/<collection-id>` selects
  that exact registered collection. Use it before a project checkout exists.
- A normal sync is autonomous. Request an unavoidable OS, browser, device, or
  administrator approval explicitly; it is not a request to guess a value,
  credential, host, or target.
- Finish only after the resolved inputs are usable and every required
  non-destructive connection probe succeeds. A healthy source machine must also
  reconcile its current state so later machines and agents can recover it.

## Bootstrap discovery

`~/.agents/doc/AGENTS.local.md` is the stable pointer to the registered private
bootstrap repository. A completed setup must also leave a registered,
continuously available Tailnet access anchor usable by a newly joined macOS,
Linux, or Windows machine; installing Tailscale without that recovery path is
not a completed setup. Do not make bootstrap availability depend on one source
workstation being online.

When the pointer is absent, discover the registered access anchor from
authenticated Tailnet state: enumerate online peers from `tailscale status
--json`, select only the peer carrying the registered
`tag:secrets-sync-anchor`, and probe its
`https://<peer>/.well-known/secrets-sync` without following redirects. Send the
local stable Tailnet device ID and require the deny-by-default endpoint to bind
it to the authenticated connection. Reject untagged responders and tag
ambiguity. Download its owner-only bootstrap snapshot, restore it to the
platform-native user config location, and create the fresh local pointer from
that snapshot. Do not stop
merely because the local pointer is missing, and do not require the user to copy
it manually. If more than one authorized anchor would produce different
registrations, ask one focused anchor question. If the anchor is reachable but
its declared bootstrap action was never installed or needs an OS approval,
report that incomplete setup and request only the exact approval needed to
install or invoke it.

Use the bundled client for this contract; do not reconstruct a raw HTTP request
or ask the user to copy a pointer. From this skill directory, run
`sh scripts/bootstrap.sh bootstrap` on macOS or Linux, or
`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bootstrap.ps1 bootstrap`
on Windows. The clients discover the tagged anchor, send the connection-bound
stable device ID, reject redirects, validate and install the owner-only
snapshot without overwriting existing state, generate or reuse the local
Ed25519 device key, enroll only its bare public key, and create the fresh local
pointer. They also expose `enroll`, `rotate`, and `revoke` actions for the same
authenticated device registration. Linux needs Python 3 or `jq`; macOS falls
back to its built-in JXA JSON parser; Windows uses `ConvertFrom-Json` and needs
the OpenSSH Client capability only when `ssh-keygen.exe` is absent.

Treat reachability and authorization separately. The bootstrap transport must
work from macOS, Linux, and Windows with authenticated Tailscale membership as
the only pre-existing machine trust and input, without a pre-copied private key,
ambient shell identity, repository credential, or manual browser enrollment.
The anchor must authorize the device against the registered bootstrap identity
and ACL with deny-by-default behavior. OS-specific SSH support may be used for
later managed host access, but is not the portable bootstrap contract. Never
describe Tailnet reachability alone as file or shell access.

The authorized anchor action must provide the verified secret-free bootstrap
snapshot and enroll only a fresh locally generated public key for the registered
restricted transfer account. Bind its fingerprint to the authenticated stable
Tailnet device ID, keep at most one anchor-managed active key per device, and
replace or revoke it through the same registered action. Only an unavoidable OS
confirmation may interrupt it; do not require a copied secret, private key,
manual pointer step, or separate account/browser login. Never guess a path,
host, account, or substitute credential.

## Reconcile with judgment

Before inspecting the contents of an unknown ignored, private, or archive
candidate, read [operations.md](references/operations.md). The only policy-only
shortcut is material already established as wholly non-secret Git content.

1. Read the registered private bootstrap source and inspect the relevant local
   project, selected collection, NAS records, compatible working machines,
   repository configuration, consumer/deployment evidence, and chronology.
   Do not treat an old manifest or mapping as stronger than the full evidence.
2. Classify every candidate by its complete private contents and owner:
   - Promote a wholly non-secret, portable project input to its canonical
     project Git repository.
   - Promote a wholly non-secret, portable common machine input to the private
     bootstrap Git repository.
   - Keep secrets, device-private material, and mixed files private. Do not
     silently split or redact a mixed file.
   Ignore rules and filenames are leads, never a classification or authority.
3. A stale or missing mapping is repair work, not a blocker. When the evidence
   converges, record the resulting current non-secret mapping in the private
   bootstrap source and continue. It must identify the resolved source record,
   scope/destination, and consumer when one exists.
4. Ask one focused question only when materially different, plausible mappings
   would send data to different destinations or consumers. Absence of an old
   registration alone is not ambiguity; investigate and repair it.
5. A promotion or mapping repair is complete only after its exact canonical Git
   update is committed, pushed, and verified at the remote revision. On a push
   or verification failure, retain the private source and repair/report the
   failure; do not retire anything.
6. For two valid, divergent copies of one resolved private record, overwrite or
   retire neither unless chronology or provenance establishes an authoritative
   copy. Otherwise preserve both and ask one focused source-version question.
7. After a verified canonical Git promotion, retire the exact former private
   archive record and manifest entry. Keep no second source of truth and never
   use recursive or archive-wide deletion.

## Secrets and deployment consumers

- A GitHub secret or variable needs a durable, verified private source before a
  write. If its value exists only in GitHub, recover it from the issuing service
  by reissuing or rotating it, then archive and verify the replacement before
  updating GitHub.
- Resolve each GitHub write from the same holistic evidence. Establish the exact
  canonical repository, Environment, kind, name, private source record, and
  intended consumer before writing; do not infer a target from one filename or
  one workflow reference.
- When that consumer mapping was stale or missing, first record its exact
  non-secret contract in private bootstrap, commit and push it, and verify the
  remote revision. Until then, do not create an Environment, write a value, or
  dispatch a workflow.
- Write only the resolved value(s) for that consumer. Revalidate names and
  source integrity without reading values back.
- Value writes do not authorize arbitrary execution. Dispatch only the resolved
  intended workflow, protected ref, and allowed inputs, after its relevant
  writes succeed. Otherwise report the verified state without dispatching.

## Machine recovery

Restore or install the registered CLI configuration and connection profiles.
When the provider supports both, prefer the owner's registered durable access
key over an expiring temporary credential; use a temporary credential only when
the provider requires it or the declared recovery path calls for it.
For an owner's personal recovery path, prefer a durable, revocable credential
over a short-lived temporary key whenever the provider and declared recovery
path permit it.
Create a fresh device key when the profile requires one, enroll it through the
registered recovery path, and verify the configured identity rather than a
bare hostname or ambient SSH identity. Repair NAS access and every registered
managed-host path before reporting readiness.

Verify the Tailnet bootstrap action from clean, pointer-free macOS, Linux, and
Windows fixtures or equivalent value-free platform tests. The action must
restore only the non-secret pointer to the platform-native user configuration
location, authenticate the requesting Tailnet device, require no copied private
key, authorize it against the registered deny-by-default bootstrap policy,
return the verified bootstrap snapshot, enroll only a fresh public key for the
registered restricted transfer account, bind it to the stable device identity,
and prove rotation and revocation. A setup
that works only from one OS, requires another pre-existing trust input, or needs
a manually copied pointer is not healthy and must be repaired before reporting
sync completion.

## Operational reference

Read [operations.md](references/operations.md) before inspecting any unknown
private candidate, or before a secret read, write, transfer, mapping or manifest
mutation, GitHub secret/variable update, or deployment action. Ordinary
diagnosis and already-established non-secret Git material may use this policy
alone.

## Boundaries

- Never publish, delete, or bulk-transfer secret, mixed, device-private, or
  out-of-scope material. A verified, wholly non-secret promotion to its
  resolved canonical Git destination is permitted.
- Keep private work scoped to the selected project, common baseline, collection,
  and exact resolved records. Never sweep every user collection to make a
  recovery convenient.
- Preserve current state only: private bootstrap owns non-secret mappings;
  private manifests own file-integrity metadata. Neither owns secret values or
  a migration/process ledger.

## Verification scenarios

Use safe dummy fixtures or value-free assertions to verify the changed behavior:

- a current mapping restores normally;
- a legacy NAS record with one evidenced consumer migrates without a question;
- competing consumers produce one focused question;
- both standalone and project requests recover the common machine baseline and
  reach NAS plus each registered managed host;
- a GitHub-only secret is rotated into a durable source before GitHub changes;
- a non-secret configuration is promoted to Git and its exact old archive record
  retires; and
- a mixed file remains private with no value exposure or out-of-scope mutation.
