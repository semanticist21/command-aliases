---
name: skill-add
description: Create or update a user skill in Claude and Codex at the same time. Use when the user invokes $skill-add, asks to add/install/make a skill, or wants a new reusable workflow available in both Claude and Codex.
user-invocable: true
argument-hint: "<skill name and behavior>"
metadata:
  short-description: Add a skill to Claude and Codex together
---

# Skill Add

Create or update a skill from the user's argument. Always make Claude and Codex
copies together; keep the shared agents copy in sync too.

## Skill roots

Write the same skill to all applicable roots:

- Claude: `~/.claude/skills/<skill-name>/SKILL.md`
- Codex: `~/.codex/skills/<skill-name>/SKILL.md`
- Shared agents: `~/.agents/skills/<skill-name>/SKILL.md`

For Codex and shared agents, also create:

- `~/.codex/skills/<skill-name>/agents/openai.yaml`
- `~/.agents/skills/<skill-name>/agents/openai.yaml`

Do not place user skills under `.system`.

## Workflow

1. Parse the user's argument:
   - infer the skill name, behavior, trigger phrases, argument style, and any target
     files/tools.
   - normalize the skill name to lowercase kebab-case.
2. Inspect existing copies in all three roots. If any copy exists, update it instead
   of creating a divergent duplicate.
3. Draft a concise `SKILL.md`:
   - frontmatter must include `name` and a trigger-rich `description`.
   - include `user-invocable: true` and `argument-hint` when the skill is meant to be
     called with `$skill-name <arg>`.
   - keep the body under 500 lines and include only instructions needed at runtime.
   - if the user requested `/skill-name`, mention that slash trigger in the
     description too.
4. Claude copy:
   - include `allowed-tools` when tool permissions matter.
   - use Claude-compatible tool names and narrow Bash patterns.
   - when the requested interface is `/skill-name`, create
     `~/.claude/commands/<skill-name>.md` as a thin shim that passes `$ARGUMENTS` to
     the skill.
5. Codex/shared copies:
   - keep the same behavioral instructions.
   - add `metadata.short-description` for Codex when useful.
   - add `agents/openai.yaml` with `display_name`, `short_description`,
     `default_prompt`, and `policy.allow_implicit_invocation`.
   - when the requested interface is `/skill-name`, keep Codex behavior in the skill
     itself by including `/skill-name` in the description and default prompt.
6. If bundled resources are needed, create the same relative folders/files in all
   three roots. Prefer small scripts over long repeated instructions.
7. Validate:
   - list all created files.
   - grep for `name: <skill-name>`, `description:`, `user-invocable`, and
     `argument-hint`.
   - for slash commands, verify `~/.claude/commands/<skill-name>.md` exists and
     contains `$ARGUMENTS`.
   - compare the behavioral bodies across roots and explain any intentional
     Claude/Codex differences.
8. Record durable machine context in `~/.codex/memo.md` when the new skill changes
   cross-project workflow.
9. **Mirror to `command-aliases`.** Publish the created/updated skill to the mirror
   repo — see *Mirror to the command-aliases repo* below. Runs on every invocation,
   including auto-triggered ones, not only explicit `$skill-add`.

## Defaults

- Default target is the current machine's user-level skill roots above.
- If the user asks for a project-local skill, still ask or confirm before skipping
  Claude/Codex user-level copies.
- If the user only gives a rough idea, choose a conservative workflow and create a
  useful first version rather than stopping for perfect wording.

## Safety

- Never store secrets in skill files.
- Public mirror hygiene: before publishing any skill, scrub secrets, private hostnames/IPs, credential paths, account IDs, and company-internal implementation details.
- Never overwrite unrelated skill resources.
- Do not delete old copies unless the user explicitly asks.
- Keep generated artifacts minimal: no README, changelog, or extra docs unless the
  skill truly needs runtime references.

## Mirror to the command-aliases repo

Every run of this skill — invoked explicitly **or auto-triggered** — must also
publish the created/updated user-scope skill to the mirror repo at
`~/code/command-aliases` (GitHub `semanticist21/command-aliases`) so the change is
versioned. Do this after validation.

- **Targets.** Copy the skill into every runtime mirror that applies:
  `agent-skills/claude/skills/<name>/` and `agent-skills/codex/skills/<name>/`
  (include bundled files such as `agents/openai.yaml`). The repo mirrors Claude and
  Codex only — there is no `~/.agents` mirror. Create the dir when the skill is not
  mirrored yet — always mirror, including brand-new skills.
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
  than cloning blindly. This mirror step applies to user-scope skills; for a
  project-local skill, leave the repo alone.
