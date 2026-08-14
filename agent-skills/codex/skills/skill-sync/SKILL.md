---
name: skill-sync
description: Create, update, compact, rename, delete, and sync user/project skills.
---

# Skill sync

User skill source is `semanticist21/command-aliases`; live Claude/Codex copies and version markers must match it. `agent-harness/AGENTS.md` is the global harness source; keep `~/.codex/AGENTS.md` and `~/.claude/CLAUDE.md` linked to it. `agent-harness/user/AGENTS.md` is the shared user-context source; keep `~/.agents/doc/AGENTS.md` linked to it. `~/.agents/doc/AGENTS.local.md` is a private machine-local overlay: inventory it only to preserve it, and never copy, merge, publish, or overwrite it. Before writes inventory all copies, surface drift and direction, then use a clean fetched-base worktree. Preserve runtime-specific support; merge detached improvements and never publish local-private/system/vendor skills. Deletion/rename needs explicit second confirmation naming skill, runtimes, and mirror/local sides. Meaningful user-scope edits require independent read-only review, secret/internal-detail scan, VERSION bump, explicit commit/push as `semanticist21`, merge, live sync, and zero residual drift. Project skills follow their repository workflow only.
