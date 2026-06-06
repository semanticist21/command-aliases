---
name: "root-skill-add"
description: "Create a user-scope (global) AI skill available across every project. Use when the user asks for /root-skill-add or to add a reusable skill at user scope (not project-local). Scaffolds ~/.claude/skills/<name>/SKILL.md and ~/.codex/skills/<name>/SKILL.md with quoted YAML frontmatter; the live user-scope dirs are never committed, but the skill is also mirrored to the command-aliases repo."
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
4. **Global-scope gate.** Root skills are always common, reusable skills for every
   project. Do not bake in project-specific architecture, paths, product decisions,
   local docs, private conventions, secrets, hostnames, or one repository's current
   structure. If the requested skill is repo-specific, stop and use `skill-add` or
   write the guidance into that repo's `AGENTS.md`/docs instead. Ask the user to
   confirm the repo-local target if needed; do not create a root skill for
   repo-local guidance. A root skill may say "read and follow the current repo's
   conventions first"; it must not encode one repo's conventions as universal
   defaults.
5. Frontmatter: only `name` and `description`. Always quote `description` as a YAML
   string (Korean text and punctuation can mis-parse unquoted).
6. Verify both files parse — frontmatter is valid YAML, `description` is quoted.
7. **Agent review (always).** Spawn a sub-agent to review the finished `SKILL.md`
   read-only. Have it judge: trigger quality (fires at the right time, doesn't over-fire
   on trivial cases), global-scope safety (no project-specific assumptions),
   workflow soundness, actionability (concrete enough to execute), and conciseness
   (no bloat). Ask for a blunt severity-tagged findings list, no praise padding.
   Apply the high/med fixes to BOTH copies, then report the verdict to the user.
8. **Mirror to `command-aliases`.** Publish both copies to the mirror repo — see
   *Mirror to the command-aliases repo* below. Runs on every invocation, including
   auto-triggered ones, not only explicit `/root-skill-add`.

## Mirror to the command-aliases repo

Every run of this skill — invoked explicitly **or auto-triggered** — must also
publish the new skill to the mirror repo at `~/code/command-aliases` (GitHub
`semanticist21/command-aliases`) so the change is versioned. Do this after the
agent review pass.

- **Targets.** Copy the skill into both runtime mirrors:
  `agent-skills/claude/skills/<name>/` and `agent-skills/codex/skills/<name>/`.
  Create the dir when the skill is not mirrored yet — always mirror, including
  brand-new skills.
- **Exclusions — never publish:** `ktbase-push` (internal hostnames), Codex
  `.system/*` built-ins, and Codex `chronicle`. Skip these even if told to "sync
  everything".
- **README table.** When mirroring a skill not previously in the repo, add its row
  to `agent-skills/README.md`.
- **Commit + push under the repo's own identity, then restore yours:**
  ```bash
  cd ~/code/command-aliases
  gh auth status                                    # note the active account to restore later
  gh auth switch -u semanticist21 -h github.com
  mkdir -p agent-skills/claude/skills agent-skills/codex/skills
  cp -R ~/.claude/skills/<name> agent-skills/claude/skills/   # repeat for the codex copy
  git add agent-skills && git commit -m "feat(<name>): <what changed>"
  git push origin HEAD
  gh auth switch -u <previous-account> -h github.com          # ALWAYS restore, even if push failed
  ```
- If `~/code/command-aliases` is missing, tell the user and skip the push rather
  than cloning blindly.

## Guardrails

- **Never commit the live skill dirs.** The `~/.claude`/`~/.codex` paths live
  outside any repo; nothing here is staged. The one exception is the
  `command-aliases` mirror, a real repo that *is* committed + pushed (see *Mirror to
  the command-aliases repo*).
- Keep `SKILL.md` concise and task-specific; no README/changelog/install docs.
- Keep both copies identical except for tool-name wording when a platform lacks a
  tool (e.g. `Explore`/`WebSearch` are Claude tools — phrase generically for Codex).
- Root skills must stay project-agnostic. Project-specific workflows, repo paths,
  architecture choices, product boundaries, and local gotchas belong in that repo's
  `AGENTS.md`, project docs, or a project-local skill, not in user-scope root skills.
- For a repo-local skill instead, use `skill-add`.
