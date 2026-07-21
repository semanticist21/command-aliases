---
name: "org-kobbokkom-repo-migration"
description: "Safely transfer GitHub repositories from a user or another owner into the Kobbokkom organization with gh CLI preflight, explicit execution, post-transfer audits, and optional local-remote updates. Use when migrating one or a controlled batch of existing repositories to Kobbokkom while preserving repository visibility and checking Actions, rulesets, Pages, packages, webhooks, secrets, and environments."
---
# Kobbokkom Repository Migration

Transfer existing GitHub repositories into `Kobbokkom` only after an explicit, per-repository authorization. Use `gh-cli-expert` and preserve the source repository until GitHub confirms transfer.

## Preflight

1. Resolve exact `owner/repo`, destination name, visibility, and immutable repository ID. Confirm the active GitHub identity has both source-admin and destination-create/transfer authority; never switch to a different account silently.
2. Read repository/org policy and inspect: default branch, visibility, forks, collaborators/teams, branch/rulesets, Actions/workflows/secrets/variables, environments, Pages, webhooks, deploy keys, GitHub Apps, packages/releases, LFS, submodules, and local remotes. Record what transfer preserves versus what needs reconfiguration.
3. Present a concise preflight table and dry-run commands. Stop for name collision, destination policy conflict, missing authority, unclear ownership, secret/private-context exposure, or any destructive optional change.

## Execute one repo

Transfer with the exact GitHub API/CLI target only after preflight approval. Do not rename, change visibility, delete source assets, move packages, or rewrite local remotes unless specifically included. Wait for the transfer result and re-query by immutable ID/new owner.

## Audit and handoff

Verify owner/name/visibility/default branch, clone and push access, rules/protection, Actions and permissions, environments/secrets availability, Pages/custom domains, webhooks/apps, packages/releases/LFS, and collaborator/team access. Update local `origin` only on named local clones and verify fetch/push URLs. For batches, run each repo’s preflight and transfer/audit independently; stop on first unsafe result and report completed vs pending rows.

## Actions runtime audit

Before declaring handoff complete, audit every checked-in `.github/workflows/*.{yml,yaml}` file and one explicitly non-destructive post-transfer smoke run.

- Never trigger a deployment, publish, or privileged workflow as migration QA. If the repository has no workflow files, record that and do not block the migration. Otherwise choose a trusted-ref smoke workflow, inspect permissions, secrets, environments, cache writes, and external effects, and leave the handoff pending when safety cannot be established.
- Resolve current action majors from upstream tags. At this revision `actions/checkout@v7` and `actions/setup-node@v7` are the Node 24-compatible majors. Resolve every `runs-on` lane, including non-matrix jobs, and require Actions Runner `v2.327.1+` plus a Node 24-supported OS/architecture; record the runner version, OS, architecture, and labels.
- Before changing a major, review its release notes and metadata, preserve the repository’s SHA-pinning policy, and review cache and privileged-workflow effects.
- Update stale JavaScript action refs only within the requested scope. Keep a project toolchain input such as `node-version: '22'` unchanged unless a separate runtime upgrade was requested.
- Parse all workflow YAML and classify each `uses:` ref by execution type: JavaScript, Docker, composite/local, or reusable workflow. Record ref form separately (major, tag, or SHA); a SHA-pinned JavaScript action still receives the Node 24 check. Report non-JavaScript refs separately.
- Record the trusted workflow commit and conclusion for every tested lane; labels alone do not prove Node 24 support.
- Treat an old action runtime, unsupported runner lane, unknown label, or failed safe smoke run as an open follow-up.

Use independent safety and behavior review for substantial migrations. Report commands/results, preserved/reconfigured items, exact follow-ups, and rollback/escalation options; never claim rollback is automatic after GitHub transfer.
