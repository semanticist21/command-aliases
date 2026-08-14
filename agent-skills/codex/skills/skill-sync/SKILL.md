---
name: skill-sync
description: Create, update, compact, rename, delete, and sync user/project skills.
---

# Skill sync

User skill source is `semanticist21/command-aliases`; live Claude/Codex copies and version markers must match it. `agent-harness/AGENTS.md` is the global harness source; keep `~/.codex/AGENTS.md` and `~/.claude/CLAUDE.md` linked to it. `agent-harness/user/AGENTS.md` is the shared user-context source; keep `~/.agents/doc/AGENTS.md` linked to it. If that path is a regular file, never overwrite or merge it: preserve it as `AGENTS.local.md` when absent; if that overlay already exists, stop and ask the user how to preserve both files, without linking or modifying either. Do not copy any of its content into the shared source without explicit approval and a secret scan. `~/.agents/doc/AGENTS.local.md` is a private machine-local overlay: inventory its existence and type only, and never copy, merge, publish, or overwrite it. Before writes inventory all copies, surface drift and direction, then use a clean fetched-base worktree. Preserve runtime-specific support; merge detached improvements and never publish local-private/system/vendor skills. Deletion/rename needs explicit second confirmation naming skill, runtimes, and mirror/local sides. Meaningful user-scope edits require independent read-only review, secret/internal-detail scan, VERSION bump, explicit commit/push as `semanticist21`, merge, live sync, and zero residual drift. Project skills follow their repository workflow only.
