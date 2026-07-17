---
name: "org-kobbokkom-repo-migration"
description: "Safely transfer GitHub repositories from a user or another owner into the Kobbokkom organization with gh CLI preflight, explicit execution, post-transfer audits, and optional local-remote updates. Use when migrating one or a controlled batch of existing repositories to Kobbokkom while preserving repository visibility and checking Actions, rulesets, Pages, packages, webhooks, secrets, and environments."
---

# Kobbokkom Repository Migration

Use `scripts/transfer-repo.sh` for the transfer. Keep the default dry-run until
every preflight succeeds. Never log or embed a token, password, private key, or
credential-bearing remote URL.

## Autonomous execution

When invoked from a Git repository, resolve its GitHub `owner/repo` from `origin` unless
the user supplied a different source. Do not ask an intake question for the source,
whether to preflight, or whether to execute when those are explicit or discoverable.

- A request to inspect/preflight runs the dry-run and reports its result.
- A request to actually migrate runs the dry-run first, stops on a failed preflight, then
  runs `--execute`. Do not ask for a copied confirmation string.
- Preserve visibility and leave local remotes unchanged unless the user explicitly asks
  otherwise.
- Ask only when no source can be resolved, multiple plausible source/destination choices
  have different effects, required GitHub authority is unavailable, or a separately
  destructive choice (such as visibility change or local-remote rewrite) is unspecified.

## Paired runner setup

When this skill and `$task-runner-setup` are explicitly invoked for the same task, treat
them as one end-to-end request: transfer first, then configure the runner integration on
the verified `Kobbokkom/<name>` destination. Pass the verified destination name and
immutable repository ID to runner setup; do not rediscover the old local `origin` or ask
the user to repeat the target. Local remotes remain unchanged unless separately requested.

## Agent review and QA

For an actual transfer, do not declare completion after the transfer API returns. Complete
the post-transfer audit first. When runner setup is paired, configure it and complete its
smoke run before review. Then spawn exactly two independent read-only reviewers:

1. **State and safety reviewer:** verify destination owner/name/immutable ID, visibility,
   and every audited GitHub setting; when runner setup is in scope, also verify trusted
   events, self-hosted labels, permissions, concurrency/isolation, and secret handling.
2. **Behavior reviewer:** verify the selected workflow against the repository commands;
   when runner setup is in scope, inspect its completed destination-repository smoke run
   and cache reuse without shared-state leakage.

Treat P0–P2 findings as release-blocking: fix, re-run the relevant audit/smoke test, and
ask the reviewer to recheck. Report the reviewer evidence and final repository URL only
after both find no P0–P2 issue. In paired mode these are the only two final reviewers;
the runner skill must not add duplicate passes.

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

`--execute` is the explicit transfer action. When the user has requested an actual
transfer, run the dry-run first and then execute it without asking for or constructing a
second confirmation string:

```bash
scripts/transfer-repo.sh \
  --source owner/repository \
  --execute
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
that separate consequence:

```bash
scripts/transfer-repo.sh \
  --source owner/repository \
  --visibility private \
  --execute
```

Do not modify local Git remotes unless explicitly in scope. To update one remote
after successful verification, pass its name:

```bash
scripts/transfer-repo.sh \
  --source owner/repository \
  --execute \
  --update-remote origin
```

## Controlled batch

Keep migrations one-at-a-time. First dry-run every source and stop on any failed
preflight. Then execute each source sequentially when the user has requested actual
migration.
Do not parallelize transfers: a partial batch needs a clear last-successful
repository and an intact audit trail.
