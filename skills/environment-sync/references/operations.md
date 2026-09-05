# Environment Sync Operations

Read this reference before private-data access, transfer, mapping or manifest
mutation, external value writes, deployment, or infrastructure cutover. Mode
policy is owned by [machine-bootstrap.md](machine-bootstrap.md),
[private-inputs.md](private-inputs.md), and
[infrastructure.md](infrastructure.md); this file owns shared mutation and
transport mechanics.

## Private data and target safety

- Do not print, paste, commit, shell-trace, or read back secret values. Keep
  local and remote private files owner-readable only.
- Work only in the registered project, common baseline, selected collection, or
  infrastructure target. Resolve normalized relative paths; reject symlinks,
  directories, generated output, caches, logs, databases, device private keys,
  and archive-wide globs.
- Treat a legacy record or live resource as evidence, not blanket authority.
  Inspect only named records and targets needed for the selected recovery.
- Before an external write, dry-inventory the exact target, authenticate the
  registered identity, and confirm the resolved desired state. Keep
  authentication, authorization, transport, integrity, and behavior failures
  distinct.

## NAS transfer and integrity

- Obtain collection registration, layout, aliases, and recovery paths from the
  registered bootstrap source; never invent a path or substitute an ambient
  identity.
- Use `scp -O` through the registered restricted NAS alias for archive files
  and manifests. Do not use SFTP, rsync, interactive shell access, recursive
  copy, or unscoped `--delete`.
- Use the registered normalized relative remote operand under the restricted
  account's logical root, not its absolute NAS storage path. Omit `-p` and other
  metadata-preservation requests unless that exact restricted protocol supports
  them; check local owner-only modes independently. After proving SSH identity
  and authentication, a wrapper rejection such as exit 126 calls for checking
  the registered operand/options, not assuming an absent archive or widening
  permissions. Exit status alone does not establish the failing phase.
- Validate normalized path, regular-file status, checksum, and owner-only mode
  before consuming a record. An unmatched legacy file cannot supply a profile
  or external value until provenance is resolved and it is re-archived and
  manifested.
- Transfer only resolved regular files, download-verify every upload, and update
  the matching manifest last. A no-op does not rewrite data or metadata.
- Preserve divergent valid copies unless chronology or provenance establishes
  authority. If it does not, ask one focused source-version question.
- If restricted transfer is rejected, use only the registered recovery or
  access-anchor path; do not broaden the account or transport.

## External values, deployment, and cutover

Deliver a resolved secret or variable through protected stdin or an owner-only
file descriptor, never an argument or environment dump. Re-list only registered
names after a write. Do not change unrelated values, protection, branches,
reviewers, retention, DNS, or organization policy.

Before deployment, verify the canonical revision, registered target, approved
inputs, rollback, and non-destructive preflight. A value write does not authorize
execution. Dispatch or apply only the resolved action after its required writes
succeed, then verify the resulting revision and service behavior.

For a replacement or cutover, stop new work through the registered drain
mechanism, prove the incumbent is idle, preserve rollback, switch one declared
consumer boundary, and verify both assignment and cleanup. Remove an incumbent
only when its retirement is explicit and the replacement has passed its
canonical checks.
