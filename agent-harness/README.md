# agent-harness

The user-global agent harness. One file, read by every project on every session.

`agent-skills/AGENTS.md` is a different thing — that one tells an agent how to replicate skills.
This one is the harness itself.

## Install

```bash
ln -sf "$PWD/agent-harness/AGENTS.md" ~/.codex/AGENTS.md
ln -sf "$PWD/agent-harness/AGENTS.md" ~/.claude/CLAUDE.md
```

Both runtimes then read the same file, and `git pull` here updates every project at once.

## Scope

Only what is true in any repository. A port, a container name, a doc path, a gate command, a branch
policy belongs to that project's own `AGENTS.md`, which wins over this file.
