---
name: secrets-sync
description: Bootstrap and synchronize user- and project-scoped agent credentials, CLI configuration, SSH/NAS access, and ignored project inputs with private Synology storage. Use on a new or repaired machine, when a clone/worktree needs its ignored inputs, or when a project adds, changes, or removes secret-backed configuration.
---

# Secrets Sync

Keep clone-critical credentials outside Git but reproducibly available from the
private archive. `secrets-sync` is both the persistent sync mechanism and the
post-enrollment machine bootstrap: the one-time OS/account enrollment makes the
registered bootstrap profile and credential locally available, then it makes
credentials, access profiles, CLIs, GitHub deployment environments, and project
inputs usable without repeated machine-specific instructions. Never put secret
values, NAS passwords, hosts, account IDs, or private paths in Git, chat,
manifests, or shared documentation.

An explicit `$secrets-sync` request authorizes an automatic reconcile of its
project archive, or of the one user collection explicitly selected with
`$secrets-sync user`. A user-scope `AGENTS.md` directive may also require one
after clone-critical inputs change. Every reconcile starts with the local dry
inventory and a read of the matching NAS manifest; transfer is permitted only
for the resulting explicit approved-source list. NAS is an archive, never a
directly edited source: it records the last version synchronized by any
registered machine.

## Request contract

- `$secrets-sync` in a repository treats its project inputs and every user
  collection that the private bootstrap source registers to that canonical
  repository as one bootstrap request. Dry-inventory and preflight each scope
  independently, reconcile project inputs, and restore only missing,
  manifest-approved user files to their registered owner-readable destinations.
  A scope failure never expands another scope or blocks its independent result;
  no separate `$secrets-sync user` is needed for those dependencies. It never
  uploads, prunes, or updates a user-collection manifest.
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
- For a registered repository deployment, the same request also bootstraps its
  registered GitHub Environment configuration. Install or restore the
  registered GitHub CLI configuration, validate the authenticated identity,
  organization/repository authority, and required non-secret scopes without a
  write, then read only the exact deployment-environment mapping owned by the
  private bootstrap source. That mapping must name the canonical repository,
  Environment, typed secret or variable name, NAS-backed user collection,
  collection-relative source-record ID, and approved opaque owner-local
  destination ID, whether creation is
  authorized, required GitHub authority, and a workflow contract with explicit
  `dispatch`, `observe`, or `never` mode, protected ref, exact allowed inputs,
  and change-trigger policy. It contains no values or endpoint/account details.
  Never infer a mapping from a workflow, `.env`, ignored file, filename,
  existing Environment, or GitHub UI state.
- Actual GitHub Environment values belong in the registered NAS user collection,
  not in the repository or private-bootstrap Git documents. Restore each exact
  mapped source record to the destination resolved from its opaque owner-local
  destination ID and validate it against
  that collection's private manifest before use. Feed one value at a time to
  `gh secret set` or `gh variable set` through owner-only stdin/file handling;
  never place a value in an argument, shell trace, environment dump, artifact,
  chat, Git, or a read-back check. Compare only registered names/existence and
  local manifest/checksum state. A missing or unregistered exact source is an
  enrollment gap: request that source only, never substitute a project `.env`
  or another credential.
- Create a missing GitHub Environment only when its exact private mapping
  authorizes creation. Set only the mapped secret/variable names; do not delete
  an Environment, prune keys, change protection/deployment rules, or alter
  unrelated configuration. Persist only checksums in separate owner-only local
  mapping state, never in a user-collection manifest. Revalidate names only
  after a write; dispatch only when a mapping explicitly authorizes it for a
  verified source-checksum change or newly created Environment, never for a
  no-op sync or missing local applied state. On a missing state, store a
  names-only baseline only after every exact group write and name check succeeds;
  it is not deployment verification. Use the mapped canonical `--repo`,
  protected ref, and exact inputs, then verify each run's repository, workflow,
  and head SHA before monitoring its result. An `observe` contract is status
  evidence only, not proof that a newly written value works.
  Browser/device authentication, insufficient GitHub authority,
  absent/unregistered exact credential sources, and unresolved timestamp
  conflicts are the only user-facing setup requests. Report API/quota failures
  as GitHub failures; never reinterpret them as NAS or target reachability.
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
- Before using a registered managed target, preflight its selected collection:
  take exact manifest and profile paths only from the private-bootstrap
  registration and collection allowlist, retrieve the manifest with `scp -O`,
  validate its schema and approved entries, then retrieve each approved profile
  with `scp -O`. Validate every profile's manifest-declared checksum and mode,
  required non-secret fields, and key-independent recovery transport before any
  target probe. A missing, malformed, unapproved, or checksum/mode-mismatched
  profile is a bootstrap-contract defect. Do not substitute an ambient SSH
  alias or default identities; repair the archived profile and its exact
  allowlist entries first.
- `secrets-sync` owns bootstrap and repair of local NAS administrator access,
  service credentials, and CLI profiles; use the resulting operator connection
  for service work. A missing manifest or failed restricted-alias transfer does
  not establish that administrator access is unavailable.
- After the user installs and signs in to Tailscale on a new or repaired device,
  `$secrets-sync user` bootstraps the selected collection's registered NAS
  operator profile alongside its restricted archive alias. First verify local
  Tailscale identity and profile-declared reachability, then restore the exact
  approved profile through restricted `scp -O`, create a fresh device identity,
  run its declared enrollment/recovery action, and probe the configured operator
  identity plus its declared non-mutating privilege check. Report Tailnet,
  profile, and operator failures separately. Do not change NAS Tailscale or SSH
  configuration, use the operator for archive transfer, or bulk-restore another
  collection.
- Before a declared Tailscale SSH probe, distinguish an unavailable local
  client/daemon, signed-out state, and additional web authentication. For the
  latter, capture the official CLI's one-time URL without logging or copying it,
  open it only in that device's local UI, and ask the user to approve it; never
  fetch or approve it automatically. Then repeat only the same non-mutating
  declared probe once. Do not diagnose the remote target as unreachable or
  alter its configuration until local Tailscale readiness succeeds.
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
- Each private-bootstrap project registration owns the explicit mapping from
  archive name to scope and exact destination. A project mapping names one
  normalized repository-relative destination; a user mapping names its
  registered collection and destination. Archive-side root selectors or legacy
  placeholders (such as `repo/` or `external/`) are not destination paths:
  never strip, rebase, or create repository directories from them. Migrate one
  only by dry-classifying it and recording its exact mapping in that private
  project registration. Without a mapping, stop for the entry; never infer a
  user collection from an outside-repository path.
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
- Git clones contain only committed tracked files. A registered,
  currently-untracked ignored project file is therefore intentionally absent
  after clone and is a valid missing-only restore candidate only when its exact
  mapping, regular-file status, checksum, and mode validate. Preserve and report
  an untracked, non-ignored file; never add it to Git or archive it merely to
  make recovery work.
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
configuration, not per-sync authentication. Its private-bootstrap registration
must also declare a bootstrap access anchor outside the affected collection:
an already-enrolled recovery/operator authority and one exact, idempotent
action that can ensure read access to that collection's registered manifest and
approved records. The anchor may repair access only; it never creates values,
uses a substitute source, or grants paths outside the registered collection.
Before requesting administrator action, verify the collection and its anchor in
the private bootstrap source and test that exact path through
`synology-kkomjang`. Never request `sudo -v` just because an old sudo ticket
expired.

Provisioning is complete only after `scp -O` can read the collection manifest
and every required connection profile, and every profile passes its
manifest-declared checksum and mode validation. The restricted allowlist must
admit both the manifest and each approved profile; a directory existing on NAS
is not evidence of recovery readiness. On an authenticated exact-path
allowlist rejection, use the declared bootstrap access anchor before reading a
profile from the affected collection: run only its exact ensure-read action,
then repeat the full manifest/profile preflight. Keep authentication and other
transfer failures distinct. An anchor that is absent, unavailable, or cannot
restore the declared read grant is a bootstrap-contract defect; request the one
registered enrollment/administrator action and make no GitHub Environment
write, creation, or dispatch.

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
- If the selected profile is absent both locally and from its registered archive,
  or cannot declare a recovery transport, target recovery cannot be automated.
  Report that exact missing prerequisite and request only the one owner or
  console enrollment that creates the profile and recovery lane.

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

### GitHub deployment-environment bootstrap

Treat GitHub Environment setup as a registered credential consumer, never as a
workflow-discovery exercise. The private bootstrap mapping is authoritative and
must explicitly bind each canonical repository to its Environment names,
secret/variable kinds and names, NAS user-collection and collection-relative
source-record IDs, opaque owner-local destination IDs, creation permission,
minimum GitHub
authority, and allowed workflow contract: `dispatch`, `observe`, or `never`;
exact workflow file path or ID; protected ref; exact input schema; complete
dispatch group; and whether a verified source change or new Environment permits
dispatch. A source record is usable only after the
registered collection manifest approves it and its restored owner-only file
checksum/mode validate. Neither a matching variable name in a project file nor
a credential visible in a shell/keychain authorizes a write.

1. Discover/install `gh`, restore its registered configuration, and run only
   non-mutating identity, token-scope, repository, and Environment-name checks
   against the mapping's canonical `--repo`.
   If browser/device approval is required, open the official device-local flow
   without logging its URL and request that single approval. Stop and report the
   exact GitHub authority/API/quota failure rather than retrying through another
   account or diagnosing a remote host.
2. Preflight each mapped collection through its declared bootstrap access
   anchor before restoring anything. Read the mapping and restore only its exact
   NAS-backed source-record IDs to destinations resolved from their opaque
   owner-local IDs. Refuse an absent, unregistered, malformed, or
manifest-mismatched record. A failed collection preflight forbids every
GitHub Environment write, creation, and dispatch in its groups. Never obtain
an Environment value from
   `.env`, ignored files, command output, a secret listing, or guessed filenames.
3. For each mapped Environment, query/create it only through the mapping's
   canonical `--repo`; create it only if it is absent and the mapping
   explicitly permits creation. Set each exact mapped name as its declared kind
   with `gh secret set --repo ... --env` or `gh variable set --repo ... --env`;
   pass the value only on stdin or from a protected file descriptor. Do not read
   secret values back, print commands containing values, enable shell tracing,
   or modify protections, deployment branches, reviewers, unrelated names, or
   retention rules.
4. Re-list only the registered names after successful writes. Resolve the
   current merged commit from the mapping's canonical repository. Coalesce all
   writes by their mapped Environment/workflow dispatch group; dispatch exactly
   once only after every required record in that group wrote successfully and a
   verified checksum changed or its Environment was newly created. A missing
   local applied-state record is names-only, not a change. Force the declared
   canonical `--repo`, exact workflow file path/ID, protected ref, and inputs.
   If an existing Environment has no state, store a names-only baseline only
   after every group write and name check succeeds; it does not verify a deploy.
   If a changed-group write, dispatch, or verification fails, retain its prior
   baseline and record no verified-dispatch state. Otherwise store only the
   resulting checksums and verified dispatch result in separate owner-only local
   state after its run succeeds. A no-op sync revalidates names only. Verify
   each resulting run reports that repository, workflow, and SHA before normal
   status monitoring. An `observe` workflow is reported as status evidence only;
   a workflow lacking the registered contract is not improvised.

Routine CLI installation/configuration, authorized Environment creation, exact
mapped secret/variable registration, registered dispatch, and run monitoring
are autonomous bootstrap work. Do not prompt for routine mapping migrations,
commits, merges, sync, or cleanup. Prompt only for the first browser/device
approval, insufficient GitHub authority, missing/unregistered exact source, or
an unresolved same-timestamp conflict.

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
   remote data as untrusted until every field and mapped destination is
   validated against the current project ignore rule or selected user
   collection allowlist; a NAS-only manifest entry never authorizes its own
   restore. Reject an unresolved legacy root selector rather than treating it
   as a repository path.
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
6. For clone/worktree recovery, restore only missing project files by default,
   and only into their exact registered ignored repository-relative
   destinations. Restore only the required registered user collection into its
   exact destination root and approved-path allowlist from the private bootstrap
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
