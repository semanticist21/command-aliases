---
name: "org-kobbokkom-repo-migration"
description: "Safely transfer GitHub repositories from a user or another owner into the Kobbokkom organization with gh CLI preflight, exact execution confirmation, post-transfer audits, and optional local-remote updates. Use when migrating one or a controlled batch of existing repositories to Kobbokkom while preserving repository visibility and checking Actions, rulesets, Pages, packages, webhooks, secrets, and environments."
---

# Kobbokkom Repository Migration

Use `scripts/transfer-repo.sh` for the transfer. Keep the default dry-run until
every preflight succeeds. Never log or embed a token, password, private key, or
credential-bearing remote URL.

## Transfer one repository

Run from any directory. The target organization is fixed to `Kobbokkom`.

```bash
# Preflight only. This cannot transfer or rename anything.
scripts/transfer-repo.sh --source owner/repository

# Optional target name.
scripts/transfer-repo.sh --source owner/repository --new-name new-name
```

The script verifies GitHub authentication, source-repository admin permission,
active organization-owner membership, target-name availability, source
visibility, and readable audit surfaces. Package auditing requires the
`read:packages` scope; refresh the current login when GitHub reports that it is
missing:

```bash
gh auth refresh -h github.com -s read:packages
```

After reviewing the dry-run output, copy its exact confirmation value:

```bash
scripts/transfer-repo.sh \
  --source owner/repository \
  --execute \
  --confirm 'owner/repository@123456->Kobbokkom/repository'
```

The script transfers through `POST repos/{owner}/{repo}/transfer`, polls the new
repository and verifies its immutable repository ID, then compares pre/post
snapshots for effective Actions permissions, workflows/variables, full rulesets, Pages, packages, full
webhook config, deploy keys, repository/environment secrets, variables, and
environment protection/deployment policies. Treat any mismatch
or unreadable audit as unfinished migration work; inspect it before declaring the
migration complete.

## Optional changes

Preserve visibility by default. Change it only when the user explicitly requests
that separate consequence; the required confirmation string then includes the
new visibility:

```bash
scripts/transfer-repo.sh \
  --source owner/repository \
  --visibility private \
  --execute \
  --confirm 'owner/repository@123456->Kobbokkom/repository;visibility=private'
```

Do not modify local Git remotes unless explicitly in scope. To update one remote
after successful verification, pass its name:

```bash
scripts/transfer-repo.sh \
  --source owner/repository \
  --execute \
  --confirm 'owner/repository@123456->Kobbokkom/repository' \
  --update-remote origin
```

## Controlled batch

Keep migrations one-at-a-time. First dry-run every source and stop on any failed
preflight. Then execute each source sequentially with its own exact confirmation.
Do not parallelize transfers: a partial batch needs a clear last-successful
repository and an intact audit trail.
