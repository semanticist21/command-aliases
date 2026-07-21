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
| agent-review     |   ✓    |   ✓   | Review this session's work via delegated subagent loop    |
| analysis         |   ✓    |   ✓   | Parallel adversarial root-cause bug investigation          |
| audit            |   ✓    |   ✓   | Read-only systemic-risk audit; lists findings to fix      |
| commit           |   ✓    |   ✓   | Stage + commit as clean Conventional Commits              |
| commit-isolate   |   ✓    |   ✓   | Split a messy tree into isolated atomic commits          |
| dead-code-removal|   ✓    |   ✓   | Remove unused code/deps with evidence and verification    |
| design           |   ✓    |   ✓   | Minimal, non-duplicative, hierarchical, well-grouped UI    |
| figma-lookup     |   ✓    |   ✓   | Index Figma storyboard screens + planning nodes           |
| git-push         |   ✓    |       | Commit + push current changes to upstream                 |
| grill-me         |   ✓    |   ✓   | Adversarially stress-test an idea/plan, one Q at a time   |
| harness-doc      |   ✓    |   ✓   | Manage project agent harness docs (add/update/polish/setup/audit) |
| inspect          |   ✓    |   ✓   | Investigation router: dispatches to audit/analysis/research |
| memo             |   ✓    |   ✓   | Save durable user/project notes; auto-routes scope        |
| microtask        |   ✓    |   ✓   | Queue into active task work, else base-branch dev loop    |
| natural-writing  |   ✓    |   ✓   | Rewrite text to natural prose; Korean AI-tell cleanup     |
| openai-image     |   ✓    |   ✓   | Generate/edit images via OpenAI gpt-image-1 API           |
| org-kobbokkom-repo-migration | ✓ | ✓ | Transfer GitHub repos safely into Kobbokkom             |
| pkg-manager      |   ✓    |   ✓   | Safely update minor versions or upgrade majors with migration handling |
| research         |   ✓    |   ✓   | Cross-checked multi-source research/review                |
| skill-sync       |   ✓    |   ✓   | Add/update/sync/compact user or project skills             |
| task             |   ✓    |   ✓   | End-to-end dev task workflow (plan → implement → QA)       |
| task-runner-setup|   ✓    |   ✓   | Configure OrbStack runners with bounded external caches    |

> **Not included in the repo (kept user-scope only):**
> - `ktbase-push` — references KT-internal registry IPs/hosts.
> - `corp-cert` — corp MITM-proxy TLS fix/rotation; local-only to keep proxy-specific details off the public mirror.

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
