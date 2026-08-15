---
name: secrets-sync
description: Safely inventory, archive, restore, and reconcile project-specific ignored secret files with private Synology storage. Use when a clone or worktree needs ignored env/config/key files restored, or when those files are added, changed, or intentionally removed.
---

# Secrets Sync

Keep clone-critical credentials outside Git but reproducibly available from the
private NAS. Never put secret values, NAS passwords, hosts, account IDs, or
private paths in Git, chat, manifests, or shared documentation.

An explicit `$secrets-sync` request authorizes a reconcile. A user-scope
`AGENTS.md` directive may also require one after clone-critical inputs change.
Every reconcile starts with the dry inventory; transfer is permitted only for
the resulting explicit approved-source list.

## Scope

- Use the local `synology-kkomjang` SSH alias only. It is the restricted sync
  account; never use an admin alias for archive, restore, or prune.
- Store each project below the NAS private root as `projects/<project-id>/`.
  Validate `<project-id>` against `^[a-z0-9][a-z0-9-]{0,62}$`; use normalized
  relative paths with no `..`, leading `/`, control characters, or shell
  metacharacters. Resolve an approved source only beneath the repository root
  or its preconfigured private-key folder.
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
  signing keys, OAuth/APNs credentials, provisioning material, and an explicit
  project secret manifest. Exclude generated output, caches, dependencies,
  logs, databases, and build artifacts even if ignored.

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

1. Inspect the repository ignore rules and enumerate ignored regular files with
   `git ls-files --others --ignored --exclude-standard`. Classify each candidate
   before transfer; do not infer that every ignored file is a secret.
2. Read the previous private manifest and present an inventory: added, changed,
   missing-local, and excluded generated files. A private manifest contains
   normalized relative paths, octal modes, and SHA-256 checksums only—never
   contents, timestamps, hosts, account data, or keys. Treat its remote
   contents as untrusted until every field and path is validated.
3. On an explicit sync request, upload new or changed approved files first over
   the restricted connection, verify checksums, then replace the manifest last.
   Keep private files owner-readable only locally and remotely.
4. Treat a file present only on NAS as a deletion candidate, not proof that it
   is obsolete. Delete it only when the task explicitly requests prune/reconcile
   and after the current approved files and manifest are safely uploaded.
   Prune only exact validated paths absent from the new approved manifest;
   never derive a delete set from a glob or recursive option.
5. For clone/worktree recovery, restore only missing files by default. Show a
   checksum conflict and obtain approval before overwriting a local file.

## Guardrails

- Run a dry inventory before every external write. Never use blanket recursive
  copy, `git clean -fdx`, or unscoped `--delete` against a secret directory.
- Do not log, hash-print, commit, or paste secret contents. Keep only stable
  paths and checksums in the private manifest.
- Confirm the restricted account cannot access anything outside `projects/`
  after a new NAS setup or permission change.
- If the NAS target, private manifest, or SSH key is unavailable, stop and ask
  for that setup to be repaired; do not create a substitute public archive.
