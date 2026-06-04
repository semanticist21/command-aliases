---
name: "skill-sync"
description: "Sync user-scope AI skills between Claude Code (~/.claude/skills), Codex (~/.codex/skills), and the semanticist21/command-aliases GitHub mirror (agent-skills/{claude,codex}/skills/<name>/SKILL.md). Use when the user asks for /skill-sync or to replicate/install, pull repo improvements, publish a local edit, reconcile drift, mirror, or delete skills across the two runtimes and the repo. Handles bidirectional drift detection, the semanticist21 push-identity switch, and explicit delete confirmation."
---

# Skill Sync

Keep one developer's user-scope skills consistent across three places:

- `~/.claude/skills/<name>/SKILL.md` — Claude Code user scope.
- `~/.codex/skills/<name>/SKILL.md` — Codex user scope (may also carry `agents/openai.yaml`).
- `semanticist21/command-aliases` repo → `agent-skills/claude/skills/<name>/` and
  `agent-skills/codex/skills/<name>/` — the GitHub mirror of the two dirs above.

A **skill** = a folder whose name is the skill name, containing `SKILL.md` (and for
some Codex skills `agents/openai.yaml`). Nothing else. The two runtimes are
independent targets: a skill may exist for one runtime only.

Pick the operation the user wants — replicate, update, or delete — and follow that
section. Always surface a one-line summary of what changed and in which direction
before writing.

## Ground rules

- **Two runtimes, two targets.** `claude/skills/<name>` ↔ `~/.claude/skills/<name>`;
  `codex/skills/<name>` ↔ `~/.codex/skills/<name>`. Keep names identical across
  runtimes when the skill exists for both.
- **Never auto-publish these to the repo** even when told to "sync everything" —
  confirm explicitly first:
  - `ktbase-push` — contains KT-internal registry IPs/hostnames; user-scope only.
  - Codex `.system/*` (skill-creator, plugin-creator, skill-installer) — Codex
    built-ins, regenerated on install.
  - Codex `chronicle`, `codex-primary-runtime` — Codex-shipped built-ins.
- **Get the repo.** Operate in a local clone. If none exists, clone it:
  `gh repo clone semanticist21/command-aliases /tmp/command-aliases`.

## Push identity (required before any push)

The repo is owned by GitHub `semanticist21`, but a dev machine often has a work
`gh` account active. Before pushing, switch identity and restore it after:

```bash
gh auth status                                       # note the Active account
gh auth switch -u semanticist21 -h github.com
git push origin HEAD
gh auth switch -u <previous-account> -h github.com   # restore
```

If `semanticist21` cannot be activated (keyring/login failure), STOP and tell the
user — do not push under the wrong identity. Offer `git push` instructions for them
to run, or `gh auth login -u semanticist21` first.

## Replicate (install repo skills onto this machine)

Default to **symlink** so the machine stays live-synced with the repo (one edit
updates both). Use `cp -R` only for a detached snapshot.

```bash
cd <repo>
for d in agent-skills/claude/skills/*/; do
  ln -sfn "$PWD/$d" ~/.claude/skills/"$(basename "$d")"
done
for d in agent-skills/codex/skills/*/; do
  ln -sfn "$PWD/$d" ~/.codex/skills/"$(basename "$d")"
done
```

Before overwriting an existing **real (non-symlink)** skill dir, check it is not a
locally-improved version — see Update.

## Update (bidirectional — both sides drift)

The dev edits skills locally while using them AND pulls repo improvements, so
updates flow both ways. Classify direction before writing.

1. **Detect drift** per skill:
   ```bash
   diff -rq ~/.claude/skills/<name> <repo>/agent-skills/claude/skills/<name>
   ```
   - Symlinked install → no drift possible (local *is* the repo file); just
     `git pull` / `git push`.
   - Identical → nothing to do.
   - Differs → decide which side is newer (ask the user if unclear).
2. **Repo → local** (pull improvements): `git pull`, then re-run Replicate
   (no-op for symlinks, `cp -R` for copies).
3. **Local → repo** (publish a local edit):
   ```bash
   cp -R ~/.claude/skills/<name> <repo>/agent-skills/claude/skills/
   cd <repo> && git add agent-skills && git commit -m "feat(<name>): <what changed>"
   ```
   Then push under the semanticist21 identity above.
4. **Both sides changed** = conflict. Do NOT silently pick one. Show the user the
   `diff` and ask which wins (or merge by hand), then sync that direction.

When publishing a **new** skill, also add its row to `agent-skills/README.md`'s
skill table (columns: skill, claude ✓, codex ✓, one-line description).

## Delete (destructive — always re-confirm)

Require an **explicit second confirmation naming the skill(s)** — never infer it
from a vague request. Restate which skill, which runtime, and which side (repo /
local / both) before acting, then wait.

- **From the repo:** `git rm -r agent-skills/<runtime>/skills/<name>`, commit, push.
- **From a machine:** `rm -rf ~/.claude/skills/<name>` (or `~/.codex/...`). If it is
  a symlink, prefer `rm ~/.claude/skills/<name>` (unlinks only — repo file untouched).

If asked to "delete a skill" without scope, ask whether they mean the repo, the
machine, or both.
