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
| coding-rule      |   ✓    |   ✓   | Minimal, contextual, idiomatic code-writing rules         |
| corp-cert-fix    |   ✓    |   ✓   | Fix corp MITM-proxy TLS errors (bun/node/pip/git/…)      |
| corp-cert-update |   ✓    |   ✓   | Rotate expired corp MITM CA cert                         |
| dead-code-removal|   ✓    |   ✓   | Remove unused code/deps with evidence and verification   |
| design           |   ✓    |   ✓   | Minimal, non-duplicative, conventional UI screen rules    |
| grill-me         |   ✓    |   ✓   | Adversarially stress-test an idea/plan, one Q at a time  |
| merge            |   ✓    |   ✓   | Merge current branch into target with a real merge commit|
| merge-squash     |   ✓    |   ✓   | Squash-merge current branch into target                  |
| openai-image     |   ✓    |   ✓   | Generate/edit images via OpenAI gpt-image-1 API          |
| research         |   ✓    |   ✓   | Cross-checked multi-source research/review               |
| react-flutter-port | ✓ | ✓   | Port React UI to Flutter with visual parity              |
| root-skill-add   |   ✓    |   ✓   | Alias to skill-sync for global user-scope skill creation  |
| rust-server-architecture | ✓ | ✓ | Shape Rust backend servers with feature-first architecture |
| skill-add        |   ✓    |   ✓   | Alias to skill-sync for creating user skills              |
| skill-sync       |   ✓    |   ✓   | Create/update/sync/compact skills across runtimes + repo  |
| skill-update     |   ✓    |   ✓   | Alias to skill-sync for revising existing skills          |
| task             |   ✓    |   ✓   | End-to-end dev task workflow (plan → implement → QA)      |
| text-to-lottie   |        |   ✓   | Create/edit Lottie JSON animations with Skottie verification |
| update-agents-md |   ✓    |   ✓   | Audit and compact AGENTS.md files across a repo           |
| update-doc       |   ✓    |   ✓   | Update project docs to match code, per its doc harness    |
| figma-lookup     |        |   ✓   | Index Figma storyboard screens + planning nodes           |
| agent-review     |   ✓    |   ✓   | Review this session's work via delegated subagent loop    |
| analysis         |   ✓    |   ✓   | Parallel adversarial root-cause bug investigation         |
| harness-setup    |   ✓    |   ✓   | Install agent handoff harness (test/doc guards) in a repo |
| humanize-korean  |   ✓    |       | Natural-writing alias for Korean AI-text cleanup          |
| humanizer        |   ✓    |       | Natural-writing alias for humanize/less-AI cleanup        |
| impeccable       |        |   ✓   | Design, audit, or polish frontend UI                      |
| memo             |   ✓    |   ✓   | Save the user's memo argument as a durable note           |
| natural-writing  |        |   ✓   | Rewrite text to natural, human-sounding prose             |
| svg-logo-designer|   ✓    |       | SVG-craft alias for logos and brand marks                 |
| svg-craft        |   ✓    |   ✓   | Author/edit/optimize hand-written SVG graphics            |

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
