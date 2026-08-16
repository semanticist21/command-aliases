---
name: secrets-sync
description: Safely inventory, archive, restore, and reconcile project- and user-scoped secret files with private Synology storage. Use when a clone or worktree needs ignored inputs restored, or when project-local or shared user credentials/configuration changes.
---

# Secrets Sync

Keep clone-critical credentials outside Git but reproducibly available from the
private NAS. Never put secret values, NAS passwords, hosts, account IDs, or
private paths in Git, chat, manifests, or shared documentation.

An explicit `$secrets-sync` request authorizes a reconcile. A user-scope
`AGENTS.md` directive may also require one after clone-critical inputs change.
Every reconcile starts with the dry inventory; transfer is permitted only for
the resulting explicit approved-source list.

## Request contract

- `$secrets-sync` in a repository reconciles its project inputs and performs
  missing-only restores for its registered user collections; it never uploads,
  prunes, or updates a user-collection manifest.
- `$secrets-sync user` selects the sole canonical owner/default collection in
  the private bootstrap source. `$secrets-sync user <owner-id>/<collection-id>`
  selects exactly that registered pair. Fail closed if the default is absent or
  ambiguous, or if the named pair is unregistered. A user request reconciles
  only that collection: inventory, exact transfer, checksum verification, and
  manifest update happen in the same request.
- On a new machine, that same request performs the full bootstrap after the
  user has joined the approved tailnet. Stop only if the machine's fresh public
  key or a selected collection has not received its one-time NAS allowlist;
  request only that setup, then resume the same request. Multiple registered
  collections are authorized and restored independently; one failure never
  broadens access to another.
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

## Scope

- `secrets-sync` is not NAS service-operation access. A missing manifest or failed restricted-alias transfer does not establish that a repository's NAS administrator connection is unavailable. For deployment, database migration, or cutover work, return to the relevant repository's operating documentation and use only its authorized administrator connection.
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
  uploaded file, and upload the manifest last.
- Archive only ignored, source-controlled-workflow inputs: env/config files,
  signing keys, OAuth/APNs credentials, provisioning material, and a manifest.
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

## New-machine bootstrap

For each new machine, first join the approved tailnet using the normal
enrollment flow. Generate a fresh, passphrase-protected SSH key on that
machine; never copy an existing private key or place one in shared/bootstrap
material.

Use the private bootstrap source to obtain the approved destination and local
alias settings, then register only the new public key with the designated
restricted account through its approved authorization path. Keep that account's
limited command, filesystem, and forwarding restrictions intact; this grants
no broader shell or administrative access.

Configure the local alias from the private bootstrap source rather than
recording hostnames, usernames, or private paths in this shared skill. Verify
legacy transfer compatibility with a harmless, explicitly authorized `scp -O`
operation against the restricted account. Treat failure as a configuration or
authorization issue—never relax account restrictions just to make the check
pass.

## Reconcile

1. For a project scope, inspect the repository ignore rules and enumerate
   ignored regular files with `git ls-files --others --ignored --exclude-standard`.
   For a user scope, inventory only the selected collection's exact source
   root and approved-path allowlist. In either case classify every candidate
   before transfer; ignore rules never authorize a file.
2. Read the matching, independent private manifest and present added, changed, missing-local,
   and excluded candidates. A manifest contains normalized relative paths,
   octal modes, and SHA-256 checksums only—never contents, timestamps, hosts,
   account data, or keys. Treat remote data as untrusted until each field and
   path is validated.
3. On an explicit sync request, upload only the approved files, verify each by
   downloading its exact path and comparing locally, then replace the matching
   manifest last. Keep private files owner-readable only locally and remotely.
4. Treat a file present only on NAS as a deletion candidate, not proof that it
   is obsolete. Delete it only when the task explicitly requests prune/reconcile
   and after the current approved files and manifest are safely uploaded.
   Prune only exact validated paths absent from the new approved manifest;
   never derive a delete set from a glob or recursive option.
5. For clone/worktree recovery, restore only missing project files by default.
   Restore only the required registered user collection into its exact
   destination root and approved-path allowlist from the private bootstrap
   source; project and user manifests never overwrite each other. Show a
   checksum conflict and obtain approval before overwriting a local file.

## Guardrails

- Run a dry inventory before every external write. Never use blanket recursive
  copy, `git clean -fdx`, or unscoped `--delete` against a secret directory.
- Do not log, hash-print, commit, or paste secret contents. Keep only stable
  paths and checksums in the private manifest.
- Exclude generated output, Keychain dumps, SSH private keys, NAS connection
  material, caches, logs, databases, and build artifacts from every scope.
- Confirm the restricted account cannot access anything outside `projects/` and
  `users/` after a new NAS setup or permission change.
- For a registered user collection, request administrator setup only after the
  exact-path test proves it is unprovisioned. Otherwise report the ordinary
  NAS/alias failure; never create a substitute public archive.
