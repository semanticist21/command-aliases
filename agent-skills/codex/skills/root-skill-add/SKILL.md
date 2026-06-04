---
name: "root-skill-add"
description: "Create a user-scope (global) AI skill available across every project. Use when the user asks for /root-skill-add or to add a reusable skill at user scope (not project-local). Scaffolds ~/.claude/skills/<name>/SKILL.md and ~/.codex/skills/<name>/SKILL.md with quoted YAML frontmatter; user-scope skills are never committed."
---

# Root Skill Add

Add a **user-scope** (global) skill that every project can discover. This is the
user-scope sibling of `skill-add`; `skill-add` writes project-local files inside a
repo, this writes self-contained skills under the user's home config. Targets:

- `~/.claude/skills/<name>/SKILL.md` — Claude Code user scope.
- `~/.codex/skills/<name>/SKILL.md` — Codex user scope.

## Workflow

1. Convert the requested title to lowercase kebab-case, under 64 characters.
2. Write the trigger `description` first — what the skill does AND when to use it.
   Activation lives in `description`; the body loads only after the trigger fires.
3. Write the **same** self-contained `SKILL.md` to both target paths above.
   User-scope skills have no project `.agents/` canonical to point at, so the body
   must stand alone — inline the full workflow, do not reference repo-local paths.
4. Frontmatter: only `name` and `description`. Always quote `description` as a YAML
   string (Korean text and punctuation can mis-parse unquoted).
5. Verify both files parse — frontmatter is valid YAML, `description` is quoted.

## Guardrails

- **Never commit.** These paths live outside any repo; nothing here is staged.
- Keep `SKILL.md` concise and task-specific; no README/changelog/install docs.
- Keep both copies identical except for tool-name wording when a platform lacks a
  tool (e.g. `Explore`/`WebSearch` are Claude tools — phrase generically for Codex).
- For a repo-local skill instead, use `skill-add`.
