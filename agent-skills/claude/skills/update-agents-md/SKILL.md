---
name: update-agents-md
description: "Maintain AGENTS.md files across a repo. Use for update, compact, sweep, or refresh AGENTS.md instructions."
---
# Update AGENTS.md

Keep AGENTS.md files accurate, concise, scoped, and within practical size limits.

## Workflow

1. Locate the scope.
   - Use `CODEX_WORKTREE` as the root if set.
   - Otherwise, use `git rev-parse --show-toplevel` when inside a Git repository.
   - Fall back to the current working directory only when no Git root is available.
   - Find all relevant files with `rg --files -g 'AGENTS.md'`.
   - Read each target `AGENTS.md` in full before editing.

2. Respect scoped ownership.
   - If a subfolder has its own `AGENTS.md`, put subfolder-specific guidance there.
   - Keep repo-wide guidance in the root `AGENTS.md`.

3. Apply hygiene rules.
   - Fix outdated or incorrect guidance, paths, commands, and ownership notes.
   - Tighten verbose sections without losing operational meaning.
   - Remove duplicate guidance when another closer or more canonical doc already owns it.
   - If a section grows to hundreds of lines, move the detail into `docs/` or an existing documentation file and link it from `AGENTS.md`.
   - Do not allow any `AGENTS.md` to exceed 1000 lines; split large content into docs and keep only routing guidance plus key constraints.
   - Keep edits ASCII unless the file already uses non-ASCII characters.

4. Add durable learnings.
   - Add conversation-learned guidance only when the user asked for a doc update or the learning is durable and repo-scoped.
   - Add only future-useful constraints, gotchas, commands, ownership boundaries, and self-corrections.
   - Do not add routine status notes, timestamp-only history, or facts already obvious from code.

5. Verify.
   - Re-read changed sections.
   - Confirm paths and commands exist when cheap to check.
   - Run the narrowest relevant docs or lint check if the repository defines one.

6. Report.
   - Provide a short numbered list of updates made.
   - If no changes were needed, state that explicitly.
