---
name: "skill-sync"
description: "Create, update, rename, compact, and sync user/project skills end-to-end."
---
# Skill Sync

Synchronize user skills between `~/.claude/skills`, `~/.codex/skills`, and the matching `semanticist21/command-aliases` mirror (`agent-skills/<runtime>/skills`). A skill is its folder plus `SKILL.md` and support files; keep runtimes independent and preserve support files unless explicitly removed.

## Routing and safety

- Before any write, surface changed copies and sync direction; full reconcile requires its full table.
- Bare `skill-sync` / “sync all” performs a full reconcile. `add <user|project>`, `update [user|project]`, rename, compact, replicate, publish, pull, and delete act as named. `root` means `user`; do not create alias skills.
- Resolve every copy first (both local runtimes, project runtimes, and mirror). `add` needs explicit scope and targets both runtimes unless narrowed. `update` preserves existing selected runtimes; infer scope only if unambiguous.
- Before any repo write, create a dedicated clean fetched-base worktree/branch. Never edit/commit in a caller's dirty checkout; stage explicit paths only. Project skills remain in their project worktree and never enter the user mirror/version.
- Scan published content for secrets, private hosts/IPs, credential paths, account IDs, and internal details. Stop for unclear hits, semantic conflict, destructive action, missing identity, or ambiguous target.

## Full reconcile

1. Inventory names/content and repo/local sync markers. Classify each runtime skill: identical; drift; repo-only (install); local-only (local-private/no action). Surface a full table and planned direction before writing.
2. Refresh a clean mirror with `git pull --ff-only`; reclassify/surface changed rows. Repo-only installs normally symlink to mirror; real directories must first be checked for local improvements.
3. For drift, auto-merge non-overlapping changes; for line clashes prefer newer edit and report winner. Ask only when edits semantically contradict. Never auto-publish local-only skills, even on reconcile.
4. Re-run `diff -rq`; report residual drift and quarantined local-only skills.

## Update, compact, delete

- User create/update/compact: edit mirror under isolation, merge detached local changes, spawn/obtain an independent read-only reviewer for meaningful edits (unavailable blocks completion), apply high/medium fixes, sync both intended local targets after landing.
- Compact non-breakingly: concise frontmatter/body, canonical shared rules, compatibility aliases. Delete aliases/skills only after explicit second confirmation naming runtimes and sides.
- Rename only when explicitly requested: create new directory/frontmatter, search literal references, then remove old copy. Delete likewise requires a second explicit confirmation with exact repo/local sides.
- Project scope follows its repository task/verification/landing workflow only.

## Publish/version/identity

- Repo `agent-skills/VERSION` is source of truth; local `.sync-version` markers record reconciled generation. Repo content write bumps once and updates both local markers; repo→local-only pull advances markers without bump.
- New mirrored skills also update `agent-skills/README.md`. Run review, secret scan, explicit staging, commit, push, then verify symlinks/detached copies and markers.
- Before push record active `gh` identity, switch to `semanticist21`, push `HEAD`, and restore prior identity. Stop rather than push as another account.
- Never auto-publish `ktbase-push`, Codex `.system/*`, `chronicle`, or `codex-primary-runtime`.

Finish user-scope updates through pushed mirror commit; report direction, changed copies, marker transition, conflicts, verification, and push. End with one concise Korean summary sentence.
