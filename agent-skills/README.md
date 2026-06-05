# agent-skills

Reusable **user-scope** AI agent skills for Claude Code and Codex, plus plugin
references. Mirror of what lives in `~/.claude/` and `~/.codex/` so the same
skills can be reused across machines.

> Asking an agent to **replicate / update / delete** these skills on a machine?
> The operating contract (sync direction, push identity, delete confirmation) is
> in [`AGENTS.md`](./AGENTS.md).

## Layout

```
agent-skills/
├── claude/skills/<name>/SKILL.md   # Claude Code user skills (~/.claude/skills/)
├── codex/skills/<name>/...         # Codex user skills (~/.codex/skills/)
└── plugins/                        # plugin install references (no vendored copy)
```

## Skills

| Skill            | claude | codex | What it does                                              |
|------------------|:------:|:-----:|----------------------------------------------------------|
| commit           |   ✓    |   ✓   | Stage + commit as clean Conventional Commits             |
| commit-isolate   |   ✓    |   ✓   | Split a messy tree into isolated atomic commits          |
| corp-cert-fix    |   ✓    |   ✓   | Fix corp MITM-proxy TLS errors (bun/node/pip/git/…)      |
| corp-cert-update |   ✓    |   ✓   | Rotate expired corp MITM CA cert                         |
| grill-me         |   ✓    |   ✓   | Adversarially stress-test an idea/plan, one Q at a time  |
| merge            |   ✓    |   ✓   | Merge current branch into target with a real merge commit|
| merge-squash     |   ✓    |   ✓   | Squash-merge current branch into target                  |
| research         |   ✓    |   ✓   | Cross-checked multi-source research/review               |
| root-skill-add   |   ✓    |   ✓   | Scaffold a new user-scope skill for both runtimes         |
| skill-add        |   ✓    |   ✓   | Create/update a user skill in both runtimes at once       |
| skill-sync       |   ✓    |   ✓   | Sync skills across both runtimes + this repo mirror       |
| skill-update     |   ✓    |   ✓   | Revise an existing skill in place across all copies       |
| task             |   ✓    |   ✓   | End-to-end dev task workflow (plan → implement → QA)      |
| update-agents-md |   ✓    |   ✓   | Audit and compact AGENTS.md files across a repo           |
| figma-lookup     |        |   ✓   | Index Figma storyboard screens + planning nodes           |
| update-doc       |        |   ✓   | Audit/refresh/compact AI-facing project docs              |

> **Not included:** `ktbase-push` — references KT-internal registry IPs/hosts;
> kept user-scope only, intentionally not published here.

## Install

Skills are plain folders with a `SKILL.md`. Symlink (stay synced with the repo)
or copy each into the runtime's user skills dir.

```bash
# Claude Code
for d in claude/skills/*/; do ln -sfn "$PWD/$d" ~/.claude/skills/"$(basename "$d")"; done

# Codex
for d in codex/skills/*/; do ln -sfn "$PWD/$d" ~/.codex/skills/"$(basename "$d")"; done
```

Use `cp -R` instead of `ln -sfn` for an independent copy.

## Plugins

See [`plugins/README.md`](./plugins/README.md). Plugins are referenced by their
marketplace source rather than vendored.
