---
name: "skill-sync"
description: "Create, update, rename, compact, and sync user/project skills end-to-end."
---
# Skill Sync

Keep user skills aligned between `~/.claude/skills`, `~/.codex/skills`, and the matching `semanticist21/command-aliases` mirror. A skill is its folder plus `SKILL.md` and support files; preserve support files unless deletion is explicitly approved. Runtimes are independent.

## Operations and safety

Bare `skill-sync` means full reconcile. `add <user|project>`, `update [user|project]`, compact, rename, replicate, publish, pull, and delete operate as named. `root` means `user`. Resolve scope/runtime/copies before writing; ask only when target/scope is ambiguous or edits semantically contradict.

Before any mirror write, use a dedicated worktree/branch from a clean fetched base; never edit/commit in a caller’s dirty checkout. Stage explicit paths. For project skills, use that repo’s isolation, verification, and landing process only—never mirror or bump user version.

## Reconcile and update

Inventory both local and mirror runtimes and version markers: mirror `agent-skills/VERSION`; local `.sync-version` files. Classify each name as identical, repo-only (install), local-only (private/no action), or drift. Surface a one-line table/plan before writing. Refresh a clean mirror then reclassify if needed.

For drift, merge non-overlapping edits; for a line clash prefer the newer edit and report it. Stop only for a semantic contradiction, secrets/private-context scan hit, destructive action, unclear target, or unavailable required push identity. Local-only skills stay quarantined during reconcile unless the user explicitly names them for publish. Never auto-publish `ktbase-push`, Codex `.system/*`, `chronicle`, or `codex-primary-runtime`.

`add` needs explicit scope and targets both runtimes unless narrowed. `update` preserves existing selected runtimes. Keep frontmatter minimal and runtime-safe; user skills must not contain private paths/hosts/credentials. A rename requires explicit user intent before removing the old directory. A delete always needs a second confirmation naming skill, runtime, and side.

## Finish

Meaningful edits get an independent read-only review for trigger quality, safety, actionability, concision, and contradictions; fix high/medium findings. Scan prospective public changes for secrets, keys, private IPs/hosts, credential paths, and account IDs.

For user mirror content changes: synchronize intended copies, update README for a new skill, increment mirror VERSION once, write both local markers, verify diffs/symlinks, commit/push once, and report `vN→vN+1`. A repo-to-local-only pull advances local markers but not VERSION. Use symlinks by default; preserve improved detached real directories by merging/copying after landing.

Before push, note active `gh` identity, switch to `semanticist21`, push, then restore it. If activation fails, stop—never push as another user. End with changed direction/copies, version gap/result, verification, residual local-private skills, and one concise Korean summary.
