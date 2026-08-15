---
name: secrets-sync
description: Safely inventory, archive, restore, and reconcile project-specific ignored secret files with private Synology storage. Use when a clone or worktree needs ignored env/config/key files restored, or when those files are added, changed, or intentionally removed.
---

# Secrets Sync

Keep clone-critical credentials outside Git but reproducibly available from the
private NAS. Never put secret values, NAS passwords, hosts, account IDs, or
private paths in Git, chat, manifests, or shared documentation.

## Scope

- Use the local `synology-kkomjang` SSH alias only. It is the restricted sync
  account; never use an admin alias for archive, restore, or prune.
- Store each project below the NAS private root as `projects/<project-id>/`.
  Validate `<project-id>` as a simple lowercase slug and resolve every local
  source under either the repository root or its approved private-key folder.
- Archive only ignored, source-controlled-workflow inputs: env/config files,
  signing keys, OAuth/APNs credentials, provisioning material, and an explicit
  project secret manifest. Exclude generated output, caches, dependencies,
  logs, databases, and build artifacts even if ignored.

## Reconcile

1. Inspect the repository ignore rules and enumerate ignored regular files with
   `git ls-files --others --ignored --exclude-standard`. Classify each candidate
   before transfer; do not infer that every ignored file is a secret.
2. Read the previous private manifest and present an inventory: added, changed,
   missing-local, and excluded generated files. A manifest contains relative
   paths, modes, and SHA-256 checksums only—never contents.
3. On an explicit sync request, upload new or changed approved files first over
   the restricted connection, verify checksums, then atomically replace the
   manifest. Keep private files owner-readable only locally and remotely.
4. Treat a file present only on NAS as a deletion candidate, not proof that it
   is obsolete. Delete it only when the task explicitly requests prune/reconcile
   and after the current approved files and manifest are safely uploaded.
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
