---
name: skill-sync
description: Create, update, compact, rename, delete, and sync user/project skills.
---

# Skill sync

Public user-skill source is `semanticist21/command-aliases`; live Claude/Codex copies and version markers must match it. `agent-harness/AGENTS.md` is the global harness source; keep `~/.codex/AGENTS.md` and `~/.claude/CLAUDE.md` linked to it. `agent-harness/user/AGENTS.md` is the public shared user-context source; keep `~/.agents/doc/AGENTS.md` linked to it. If that path is a regular file, never overwrite or merge it: preserve it as `AGENTS.local.md` when absent; if that overlay already exists, stop and ask the user how to preserve both files, without linking or modifying either. Do not copy any of its content into the public source without explicit approval and a secret scan.

## Private companion

`semanticist21/agent-private` is the optional portable non-public companion. Keep it cloned at `~/.agents/private`; its `AGENTS.md` is read only when relevant and is never merged or linked into the public user context. Verify the exact repository and its private visibility before cloning, pulling, or pushing. It may hold durable non-public operating context, but never credentials, API keys, `.p8` files, account identifiers, hosts, or private secret-file paths. Actual credential material and its private manifest stay in the private secret archive.

`~/.agents/doc/AGENTS.local.md` remains a machine-local overlay: inventory its existence and type only, and never copy, merge, publish, overwrite, or synchronize it. New devices get a fresh local overlay and their required secrets through the approved restore flow; do not copy device SSH private keys between machines.

Before writes, inventory the public source, private companion when present, live links/copies, and drift direction; then use a clean fetched-base worktree. Preserve runtime-specific support; merge detached improvements and never publish local-private/system/vendor skills. Deletion/rename needs explicit second confirmation naming skill, runtimes, and mirror/local sides. Meaningful user-scope edits require independent read-only review, secret/internal-detail scan, VERSION bump, explicit commit/push as `semanticist21`, merge, live sync, and zero residual drift. Project skills follow their repository workflow only.
