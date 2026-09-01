# Secrets Sync Operations

Read this reference for private data, transport, mapping/manifest changes, or
GitHub deployment actions.

## Private data and scope

- Do not print, paste, commit, shell-trace, or read back secret values. Keep
  local and remote private files owner-readable only.
- Work only in the registered project, common baseline, or selected collection.
  Resolve normalized relative paths; reject symlinks, directories, generated
  output, caches, logs, databases, device private keys, and archive-wide globs.
- A legacy record is a candidate, not blanket authority. Inspect only the
  relevant registered archive/collection and named records needed to resolve
  the requested recovery.

## Sources of truth

- The registered private bootstrap Git repository owns current non-secret
  mappings: source record, scope/destination, consumer, and permitted recovery
  or deployment contract. It has no secret values, endpoint/account details,
  or migration history. A mapping becomes current only after its exact change is
  committed, pushed, and verified at the canonical remote revision.
- A GitHub consumer contract records its canonical repository, Environment,
  kind/name, private source record, allowed workflow/ref/inputs, and Environment
  creation authority. Persist and verify a repaired contract before any GitHub
  Environment creation, value write, or dispatch.
- The private archive manifest owns integrity only: normalized path, mode,
  SHA-256 checksum, and UTC modification time. It never authorizes an unrelated
  destination or deployment consumer by itself.
- A promoted portable input is durable only after its exact canonical Git change
  is committed, pushed, and verified at the remote revision. On failure, retain
  its private source. Then retire exactly its former archive record and manifest
  entry; leave every other record untouched.

## NAS transfer and integrity

- Obtain bootstrap layout, collection registration, aliases, and recovery paths
  from the registered bootstrap source; never invent an archive layout or use
  an ambient identity as a substitute.
- Use `scp -O` through the registered restricted NAS alias for every archive
  transfer, including manifests. Do not use SFTP, rsync, interactive shell
  access, recursive copy, or unscoped `--delete`.
- Before restoring or consuming an archive record, validate its normalized path,
  regular-file status, checksum, and owner-only mode against the manifest. An
  unmatched legacy record may inform investigation but cannot supply a profile
  or GitHub value until it is provenance-resolved, re-archived, and manifested.
- Dry-inventory before an external write. Transfer only resolved regular files,
  download-verify every upload, and update the matching manifest last. A no-op
  does not rewrite files or manifests.
- When valid local and archive copies of one resolved private record diverge,
  preserve both unless chronology or provenance establishes the authoritative
  copy. If it cannot, ask one focused source-version question; do not overwrite
  or retire either copy.
- If an exact restricted transfer is rejected, use only the registered recovery
  or access-anchor path. Keep authentication, permission, transport, and
  integrity failures distinct.

## Machine access

- Bootstrap recovery over Tailscale requires a continuously available,
  pre-registered access anchor; peer discovery and network reachability are not
  authorization. Its client path must work on macOS, Linux, and Windows without
  SSH or a pre-copied device key, using authenticated Tailscale membership as
  the only pre-existing machine trust and input. Use OS-specific SSH only after
  bootstrap for a separately registered managed-host profile; macOS cannot
  serve Tailscale SSH.
- The Tailnet bootstrap action must authenticate the requesting Tailnet device,
  authorize it against the registered bootstrap identity and ACL, and deny by
  default. Discovery uses authenticated control-plane state and accepts only an
  online peer carrying `tag:secrets-sync-anchor`; reject untagged responders,
  multiple tagged anchors, and redirects. The client sends its stable Tailnet
  device ID, and the service must bind it to the proxied connection before
  authorizing the fixed `/.well-known/secrets-sync` HTTPS path. For an
  authorized device it may return the verified secret-free
  bootstrap snapshot and enroll one bare, locally generated `ssh-ed25519`
  public key for the registered restricted transfer account. Bind the key
  fingerprint to that device ID, keep at most one anchor-managed active key per
  device, and provide atomic idempotent replace and revoke operations. It must
  reject non-Tailnet and merely
  reachable-but-unauthorized devices, private keys, copied device keys, key
  comments, other key types, ambient SSH identities, and manual account/browser
  login, and never expose archive values or credentials.
- Restore registered profiles before probing a managed target. Generate fresh
  device keys locally; never copy an existing device private key or Keychain
  dump. Enroll only through the declared recovery action.
- Validate the explicit configured identity and its non-destructive readiness
  probe. A reachable hostname, ambient SSH key, or interactive login is not
  proof that the registered profile works.
- Browser, OS, or device approval may be requested when the declared recovery
  path requires it. Do not automate that approval or broaden it into access to
  another target.

## GitHub values and dispatch

- Deliver each resolved secret or variable through protected stdin or an
  owner-only file descriptor; never a command argument or environment dump.
  Re-list only registered names after a write.
- Create an Environment, write values, or dispatch only for the resolved
  canonical repository and consumer contract. Do not change unrelated keys,
  protection rules, branches, reviewers, or retention.
- A dispatch is allowed only for the resolved workflow, protected ref, and
  allowed inputs after all relevant writes succeed. Verify repository, workflow,
  and resulting revision before monitoring the run.
