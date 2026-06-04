# AGENTS.md — agent-skills

Operational guide for an AI agent asked to **replicate, update, or delete** the
skills in this folder on a machine. The folder mirrors a developer's user-scope
skills for Claude Code (`~/.claude/skills/`) and Codex (`~/.codex/skills/`).

Read [`README.md`](./README.md) for the layout and skill table first. This file
is the *how-to-operate* contract; the README is the *what's-here* reference.

## Ground rules

- A **skill** = a folder containing `SKILL.md` (Codex skills may also carry
  `agents/openai.yaml`). The folder name is the skill name. Nothing else.
- **Two runtimes, two targets.** `claude/skills/<name>` ↔ `~/.claude/skills/<name>`,
  `codex/skills/<name>` ↔ `~/.codex/skills/<name>`. Keep them independent — a skill
  may exist for one runtime only (e.g. `figma-lookup`, `update-doc` are Codex-only).
- **Push identity.** This repo is owned by GitHub `semanticist21`, but a dev machine
  may have a second `gh` account active (e.g. a work account). Before pushing:
  ```bash
  gh auth switch -u semanticist21 -h github.com
  git push origin HEAD
  gh auth switch -u <previous-account> -h github.com   # restore
  ```
  Check the active account with `gh auth status` first and restore it after.
- **Never auto-publish these** (kept user-scope only, do NOT add to the repo even if
  told to "sync everything" — confirm with the user if they explicitly want them):
  - `ktbase-push` — contains KT-internal registry IPs/hostnames.
  - Codex `.system/*` (skill-creator, plugin-creator, skill-installer) — Codex
    built-ins, regenerated on install.
  - Codex `chronicle` — Codex-shipped screen-view built-in. Empty `codex-primary-runtime`.

## Replicate (install onto a machine)

Default to **symlink** so the machine stays live-synced with the repo (one edit
updates both). Use copy only when an independent, detached snapshot is wanted.

```bash
# from the repo root; symlink every skill into the runtime's user dir
for d in agent-skills/claude/skills/*/; do
  ln -sfn "$PWD/$d" ~/.claude/skills/"$(basename "$d")"
done
for d in agent-skills/codex/skills/*/; do
  ln -sfn "$PWD/$d" ~/.codex/skills/"$(basename "$d")"
done
```

Swap `ln -sfn` for `cp -R` to detach. **Before overwriting an existing real
(non-symlink) skill dir, check it isn't a locally-improved version** — see Update.

## Update (bidirectional — local and repo both drift)

The dev edits skills locally while using them, AND pulls repo improvements. So
updates flow both ways. Always classify direction before acting.

1. **Detect drift** per skill:
   ```bash
   diff -rq ~/.claude/skills/<name> agent-skills/claude/skills/<name>
   ```
   - Symlinked install → no drift possible (local *is* the repo file); just
     `git pull` / `git push`.
   - Identical → nothing to do.
   - Differs → determine which side is newer (ask the user if unclear).

2. **Repo → local** (pull improvements): `git pull`, then re-run the replicate
   step for symlinks (no-op) or `cp -R` for copies.

3. **Local → repo** (publish a local improvement): copy the local skill back,
   then commit + push (mind the push identity above):
   ```bash
   cp -R ~/.claude/skills/<name> agent-skills/claude/skills/
   git add agent-skills && git commit -m "feat(<name>): <what changed>"
   ```

4. **Both sides changed** = conflict. Do NOT silently pick one. Show the user the
   `diff` and ask which wins (or merge by hand), then sync that direction.

Surface a one-line summary of what drifted and the direction chosen before writing.

## Delete (destructive — always re-confirm)

Deletion needs an **explicit second confirmation from the user naming the
skill(s)** — never infer it from a vague request.

- **From the repo:** `git rm -r agent-skills/<runtime>/skills/<name>`, commit, push.
- **From a machine:** `rm -rf ~/.claude/skills/<name>` (or `~/.codex/...`). If it's
  a symlink, prefer `rm ~/.claude/skills/<name>` (unlinks only — repo file untouched).

Before any delete: restate exactly which skill, which runtime, and which side
(repo / local / both) will be removed, and wait for the user to confirm. If asked
to "delete a skill" without scope, ask whether they mean the repo, the machine, or
both.

## Add a new skill

Mirror the layout: create `agent-skills/<runtime>/skills/<name>/SKILL.md` (plus
`agents/openai.yaml` for a Codex skill that needs it), update the README skill
table, then commit + push. Keep skill names identical across runtimes when the
skill exists for both.
