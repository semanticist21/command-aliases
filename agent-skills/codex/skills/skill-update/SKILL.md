---
name: "skill-update"
description: "Update or revise an existing AI skill in place — change its trigger, workflow, scope, or fix bugs in the steps. Use when the user asks for /skill-update or to edit/revise/tweak/fix an existing skill (not create a new one). Locates the skill across Claude (~/.claude/skills, project .claude/skills) and Codex (~/.codex/skills), applies the change to every copy that exists, and keeps them in sync with valid quoted YAML frontmatter."
---

# Skill Update

Edit an **existing** skill rather than scaffold a new one. A skill may live in
several places at once; the job is to find every copy, apply the same change, and
keep them identical. Search these roots (in priority order):

- `~/.claude/skills/<name>/SKILL.md` — Claude Code user scope.
- `<repo>/.claude/skills/<name>/SKILL.md` — Claude Code project scope.
- `~/.codex/skills/<name>/SKILL.md` — Codex user scope.
- `<repo>/.codex/skills/<name>/SKILL.md` — Codex project scope.

If the user wants a brand-new skill instead, hand off to `root-skill-add`
(user scope) or `skill-add` (project scope).

## Workflow

1. **Resolve the target.** Take the skill name from the args; if absent, infer it
   from what the user described and confirm. Search all four roots above for
   `<name>/SKILL.md`. List the copies you found before editing — if zero, stop and
   tell the user the skill does not exist (offer `root-skill-add`/`skill-add`).
2. **Read every copy.** They should be identical except for tool-name wording
   (a web-search or file-search tool may be named differently across platforms).
   Note any pre-existing drift so you do not silently overwrite an intentional
   difference.
3. **Apply the change.** Make the edit the user asked for. Common edits:
   - **Trigger** — rewrite `description` so it fires at the right time and does not
     over-fire on trivial cases. Activation lives entirely in `description`; the
     body loads only after the trigger matches.
   - **Workflow/body** — change steps, fix a broken command, add a guardrail.
   - **Rename** — if the `name` changes, the directory must change too: write the
     new `<newname>/SKILL.md`, update the `name:` field, delete the old dir, and
     grep the other skills for references to the old name (they invoke each other
     by literal name).
4. **Keep frontmatter valid.** Only `name` and `description`. Always quote both as
   YAML strings (Korean text and punctuation mis-parse unquoted). `name` must be
   lowercase kebab-case, under 64 chars, and match the directory.
5. **Sync all copies.** Write the same edit to every copy found in step 1, keeping
   only the deliberate tool-name wording differences. Do not leave copies divergent.
6. **Verify.** Re-read each edited file: frontmatter parses, `description` is
   quoted, body stands alone (no dangling references to removed steps).
7. **Agent review (always).** Spawn a read-only sub-agent to review the updated
   `SKILL.md`. Have it judge: trigger quality (fires at the right time, no
   over-fire), workflow soundness, actionability, conciseness, and whether the
   edit introduced any contradiction with the rest of the body. Ask for a blunt
   severity-tagged findings list, no praise padding. Apply high/med fixes to ALL
   copies, then report the verdict to the user.
8. **Mirror to `command-aliases`.** Publish the edit to the mirror repo — see
   *Mirror to the command-aliases repo* below. This runs on every invocation,
   including auto-triggered ones, not only explicit `/skill-update`.

## Mirror to the command-aliases repo

Every run of this skill — invoked explicitly **or auto-triggered** — must also
publish the affected skill(s) to the mirror repo at `~/code/command-aliases`
(GitHub `semanticist21/command-aliases`) so the change is versioned. Do this after
the local edits and the agent review pass.

- **Targets.** Copy each touched skill into the Claude mirror when a `~/.claude`
  copy exists and the Codex mirror when a `~/.codex` copy exists:
  `agent-skills/claude/skills/<name>/` and `agent-skills/codex/skills/<name>/`
  (include bundled files such as `agents/openai.yaml`). Create the dir when the
  skill is not mirrored yet — always mirror, including brand-new skills.
- **User-scope only.** Mirror only user-scope copies (`~/.claude`/`~/.codex`). A
  skill edited solely in a project repo's `.claude`/`.codex` is not pushed to
  `command-aliases` — leave that repo to the user.
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

- **Never commit the live skill dirs.** The `~/.claude`/`~/.codex` user-scope paths
  live outside any repo — never stage them. The one exception is the
  `command-aliases` mirror, a real repo that *is* committed + pushed (see *Mirror to
  the command-aliases repo*). For project-scope copies, leave staging/committing to
  the user unless they ask.
- **Edit in place — do not rewrite wholesale.** Preserve the parts the user did not
  ask to change; a revision is surgical, not a fresh scaffold.
- **Public mirror hygiene.** Before publishing any skill, scrub secrets, private hostnames/IPs, credential paths, account IDs, and company-internal implementation details.
- Keep `SKILL.md` concise and task-specific; do not add README/changelog/install
  bloat while editing.
- If copies have drifted before you arrive, surface the difference and ask which
  version is canonical rather than picking one blindly.
