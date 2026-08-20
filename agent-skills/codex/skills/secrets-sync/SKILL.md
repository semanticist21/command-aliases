---
name: secrets-sync
description: Bootstrap and synchronize user- and project-scoped agent credentials, CLI configuration, SSH/NAS access, and ignored project inputs with private Synology storage. Use on a new or repaired machine, when a clone/worktree needs its ignored inputs, or when a project adds, changes, or removes secret-backed configuration.
---

# Secrets Sync

Keep clone-critical credentials outside Git but reproducibly available from the
private archive. `secrets-sync` is both the persistent sync mechanism and the
post-enrollment machine bootstrap: the one-time OS/account enrollment makes the
registered bootstrap profile and credential locally available, then it makes
credentials, access profiles, CLIs, and project inputs usable without repeated
machine-specific instructions. Never put secret values, NAS passwords, hosts,
account IDs, or private paths in Git, chat, manifests, or shared documentation.

An explicit `$secrets-sync` request authorizes an automatic reconcile of its
project archive, or of the one user collection explicitly selected with
`$secrets-sync user`. A user-scope `AGENTS.md` directive may also require one
after clone-critical inputs change. Every reconcile starts with the local dry
inventory and a read of the matching NAS manifest; transfer is permitted only
for the resulting explicit approved-source list. NAS is an archive, never a
directly edited source: it records the last version synchronized by any
registered machine.

## Request contract

- `$secrets-sync` in a repository automatically reconciles its project inputs
  and performs missing-only restores for its registered user collections; it
  never uploads, prunes, or updates a user-collection manifest.
- `$secrets-sync user` selects the sole canonical owner/default collection in
  the private bootstrap source. `$secrets-sync user <owner-id>/<collection-id>`
  selects exactly that registered pair. Fail closed if the default is absent or
  ambiguous, or if the named pair is unregistered. A user request reconciles
  only that collection: inventory, exact transfer, checksum verification, and
  manifest update happen in the same request.
- On a new or repaired machine, that same request performs the full bootstrap
  after the user completes the one-time OS/account enrollment required by the
  private profile. Discover or install registered CLIs, restore and validate
  their registered login/configuration, create a fresh device SSH key, configure
  aliases, register the public key through the approved bootstrap credential,
  and verify each required connection. Ask only for a missing initial OS/account
  enrollment; do not turn a routine missing CLI, alias, credential, or public-key
  registration into repeated user instructions. If the registered bootstrap
  profile/credential is not locally available, request only that exact initial
  enrollment repair; never guess or substitute a credential or operator path.
  Multiple registered collections are authorized and restored independently; one
  failure never broadens access to another.
- When a user explicitly provides a credential, signing key, or secret file
  and asks to retain, configure, release, or deploy with it, treat that exact
  file as an approved `$secrets-sync` source in the same turn. Before consuming
  it, dry-inventory the one regular non-symlink file, classify it from the
  user's stated owner/scope, install it owner-readable only in its approved
  local private root, reconcile it to the matching NAS collection, and verify
  the returned checksum before configuring a CLI to reference that private
  root. Never use a transient Downloads/Desktop path as durable CLI state.
  If the user did not state whether it is project- or user-scoped, or its
  registered collection is absent or ambiguous, ask one focused question and
  do not archive, upload, or configure around a guessed destination.
- When repository work adds, changes, or removes a secret-backed requirement,
  reconcile its exact project archive and private manifest, then update the
  owning repository's non-secret contract as needed: ignored-path rule,
  example/template, and concise setup documentation. Never put the secret value
  or a private host/account identifier in that contract.

## Scope

- The private bootstrap source is its registered Git repository, not a
  machine-local path. When collection registration, archive layout, or NAS
  details are needed and no local checkout exists, obtain the registered
  source (e.g. `gh repo clone`) and treat its documents as authoritative;
  never probe for a guessed manifest filename or archive layout.
- `secrets-sync` owns bootstrap and repair of local NAS administrator access,
  service credentials, and CLI profiles; use the resulting operator connection
  for service work. A missing manifest or failed restricted-alias transfer does
  not establish that administrator access is unavailable.
- Use the local `synology-kkomjang` SSH alias only. It is the restricted sync
  account; never use an admin alias for archive, restore, or prune.
- Classify the secret before choosing a destination: use `projects/<project-id>/`
  only for a credential/configuration owned by one repository; use
  `users/<owner-id>/<collection-id>/` only when the user explicitly says it is
  shared across projects or machines. Never infer shared scope from a
  convenient filename. Validate every ID against
  `^[a-z0-9][a-z0-9-]{0,62}$`.
- Resolve project sources only beneath the repository root. Resolve user-scope
  sources only beneath the selected collection's exact source root and
  approved-path allowlist in the private bootstrap source; never copy a shared
  credential into a repository merely to make it syncable. Files outside that
  collection are not inventory, upload, restore, or prune candidates. Use
  normalized relative paths with no `..`, leading `/`, control characters, or
  shell metacharacters.
- A user-scope request selects the registered default or one named
  owner/collection, never every user secret. Keep its ownership and repository
  consumers in the private bootstrap source, not Git, manifests, or chat.
- Reuse the registered user collection for new shared credentials; never create
  a collection per key or repository.
- Ignore rules only produce inventory candidates; they never authorize
  transfer. Before every transfer, require an explicit approved-source list.
  Each entry must be an ignored, non-symlink regular file with a validated
  relative path. Reject directories, generated output, and every unlisted
  candidate.
- Use `scp -O` over `synology-kkomjang` for every file transfer, including the
  manifest. Do not use SFTP, rsync, or `scp` without `-O`; this restricted
  account has no interactive shell. Verify checksums by downloading each exact
  uploaded file, and upload the manifest last. Read-only manifest retrieval is
  required for automatic reconciliation, but a reconciled no-op performs no
  file or manifest upload.
- Archive only ignored, source-controlled-workflow inputs: env/config files,
  signing keys, OAuth client credentials and secrets, API/service-account keys,
  CLI tokens, APNs credentials, provisioning material, and a manifest. Restore
  those values only to their registered private/NAS-only destinations; repository
  contracts name required keys but never contain their values.
  A user scope may hold an explicitly shared release/signing credential but no
  project build output, caches, dependencies, logs, databases, or artifacts.

## User-collection provisioning

A registered `users/<owner-id>/<collection-id>/` collection needs one initial
restricted-account allowlist and ownership setup. Treat that as persistent NAS
configuration, not per-sync authentication. Before requesting administrator
action, verify the collection is registered in the private bootstrap source and
test that exact path through `synology-kkomjang`. Never request `sudo -v` just
because an old sudo ticket expired.

If the exact-path test proves the collection is unprovisioned, request one
terminal-bound administrator session to grant only that collection's existing
restricted access. Keep its command, path, and forwarding limits intact. After
setup, verify one approved `scp -O` transfer and checksum (manifest last), and
confirm an unregistered sibling remains denied. Record completion only in the
private bootstrap source.

## Machine bootstrap and repair

Canonical pointer to the private bootstrap source:
`~/.agents/doc/AGENTS.local.md`; read it first. Use the private
bootstrap profile to determine the approved enrollment path, credential
destination, aliases, expected CLIs, and account checks. Generate a
fresh device SSH key; never copy an existing private key or Keychain database.
Use the registered bootstrap credential to enroll that public key, configure the
operator and restricted-transfer aliases, then verify their intended roles.

### Remote-access recovery

- A CI host, Apple build host, or other managed machine is a registered
  bootstrap target, never a short hostname inferred from DNS or the current
  local account. Its selected user collection must own an owner-readable
  connection profile and a key-independent recovery transport. The profile
  declares a symbolic target, the exact local SSH alias and login fields, normal
  transport, recovery transport and its identity-enrollment prerequisite, fresh
  identity/key-store policy, and the allowed public-key enrollment action. It
  contains no device private key. A tailnet SSH lane or a console-approved
  management lane can be that recovery transport. Private bootstrap documents
  retain only a non-secret discovery pointer to this selected profile; target
  connection values stay in the owner-readable collection.
- After the user completes the one-time NAS and identity enrollment on a new
  device, restore that profile, create a fresh device SSH key, add it to the
  declared platform provider, and install an explicit local host profile with
  an owner-only `IdentityFile`, its required agent/key-store behavior, and
  `IdentitiesOnly yes`. Run `ssh -G` and an explicit-identity probe without
  printing identifiers before using the registered recovery transport. Device
  keys are never archived or shared between machines.
- On a repaired device, test the explicit configured identity, including the
  platform key store when the profile requires it. If the server rejects it,
  test the registered recovery transport before asking the user for a key or
  generating a replacement. A stable host key or a reachable bare hostname is
  not evidence that the intended account, identity, or profile is present.
- The recovery transport must have a non-mutating readiness probe that is
  verified while normal SSH still works. Its enrollment action is pinned to the
  declared target and login, accepts only one validated fresh public key, and
  is idempotent and atomic; it cannot run arbitrary remote commands or modify
  another account. Verify the exact configured identity through the normal
  alias after enrollment.
- If the target profile or its recovery transport is absent, report a
  bootstrap-contract defect immediately. Do not fall back to `ssh <hostname>`
  with default identities, and do not claim the target is unreachable merely
  because that unaffiliated connection fails. Restore or repair the registered
  profile first. Only when the declared recovery transport also fails may a
  one-time console or identity-enrollment action be requested.

Fresh-machine readiness is one sequence: verify the user's Git identity and
initial NAS enrollment, restore and checksum-verify the selected profile,
verify restricted NAS transfer, probe the recovery transport, then verify the
configured normal alias with its exact fresh identity. Report the first missing
enrollment, profile, or transport distinctly. A legacy whole-directory backup
or normal interactive SSH session is not a substitute for this sequence.

Install or repair every registered CLI and its credential/configuration before
declaring the machine ready. Complete browser or OS approval only when it is an
unavoidable first-enrollment requirement; after that, record no machine-specific
walkthrough in public docs. Validate the required account, target, and access
mode non-mutatively: CLI identity, SSH alias, restricted `scp -O` transfer,
operator connection, and any declared non-interactive sudo capability.

## Reconcile

1. For a project scope, inspect the repository ignore rules and enumerate
   ignored regular files with `git ls-files --others --ignored --exclude-standard`.
   For a user scope, inventory only the selected collection's exact source
   root and approved-path allowlist. In either case classify every candidate
   before transfer; ignore rules never authorize a file.
2. Read the matching, independent private manifest and classify added, changed,
   missing-local, and excluded candidates. A manifest contains normalized
   relative paths, octal modes, SHA-256 checksums, and the source file's UTC
   modification timestamp—never contents, hosts, account data, or keys. Treat
   remote data as untrusted until every field and path is validated against the
   current project ignore rule or selected user collection allowlist; a
   NAS-only manifest entry never authorizes its own restore.
3. Reconcile each approved path automatically. If it exists only locally,
   upload it. If it exists only on NAS, restore it unless the task explicitly
   requests prune. If both checksums match, do nothing. If both exist and
   checksums differ, the version with the later manifest/source modification
   timestamp wins: upload the newer local file or restore the newer NAS file.
   If timestamps are equal, malformed, or otherwise cannot establish an order,
   use `$grill-me` to ask one consequential resolution question before touching
   that path. Keep private files owner-readable only locally and remotely.
4. Upload only paths selected by that classification, verify each upload by
   downloading its exact path and comparing locally, then replace the matching
   manifest last only when its contents changed. A fully reconciled no-op must
   not upload files or rewrite the manifest.
5. Treat a file present only on NAS as a deletion candidate only when prune was
   explicitly requested. Prune only exact validated paths absent from the new
   approved manifest after current approved files and the manifest are safely
   uploaded; never derive a delete set from a glob or recursive option.
6. For clone/worktree recovery, restore only missing project files by default.
   Restore only the required registered user collection into its exact
   destination root and approved-path allowlist from the private bootstrap
   source; project and user manifests never overwrite each other.
7. When a project's secret contract changed, keep its archive manifest and
   repository-owned non-secret contract in the same reconciliation: add or remove
   the approved ignored path, template/example, and minimal documentation together.

## Guardrails

- Run a dry inventory before every external write. Never use blanket recursive
  copy, `git clean -fdx`, or unscoped `--delete` against a secret directory.
- Treat `scp -O` exit 126 with `lost connection` on an authenticating SSH session
  as ForceCommand allowlist rejection, not a broken account; read the wrapper
  read-only through the operator connection before requesting provisioning.
- When tightening an allowlist, preserve every registered collection's entries and
  keep a dated wrapper backup.
- Do not log, hash-print, commit, or paste secret contents. Keep only stable
  paths, modes, checksums, and UTC modification timestamps in the private
  manifest.
- Exclude generated output, raw Keychain dumps, SSH private keys, caches, logs,
  databases, and build artifacts from every scope. A registered private bootstrap
  credential or connection profile is allowed in its user collection; install it
  into the local platform credential store or private root rather than publishing
  or copying an existing device key.
- Confirm the restricted account cannot access anything outside `projects/` and
  `users/` after a new NAS setup or permission change.
- For a registered user collection, request administrator setup only after the
  exact-path test proves it is unprovisioned. Otherwise report the ordinary
  NAS/alias failure; never create a substitute public archive.
