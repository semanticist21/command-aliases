---
name: "memo"
description: "Save the user's memo argument as a durable note in the right scope. Use when the user invokes $memo, says memo/save/remember this, or asks to persist an instruction, preference, follow-up, pitfall, agent mistake, environment fact, or reusable reminder; prefer the current project's harness docs for project-specific mistakes and traps."
user-invocable: true
argument-hint: "<note to persist>"
allowed-tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Grep
  - Glob
  - Bash(date*)
  - Bash(pwd*)
  - Bash(git rev-parse*)
  - Bash(mkdir*)
  - Bash(test*)
---

# Memo

Save the memo argument the user provided. Treat the argument as the source of truth:
preserve exact paths, identifiers, commands, and constraints. Rephrase only enough to
make the stored note compact and useful.

## Target selection

1. If the user gives an explicit target path, write there.
2. If the note concerns the current repo, write inside that repo's harness docs:
   - Use the nearest relevant `AGENTS.md` for subtree-specific rules, ownership,
     setup quirks, implementation gotchas, and mistakes limited to that subtree.
     If no local `AGENTS.md` exists and the note is useful for future work in that
     subtree, create one there.
   - Use `doc/playbook.md` when it exists and the note is a project-wide repeatable
     trap, debugging lesson, or agent mistake future agents should avoid.
   - Use the repo-root `AGENTS.md` for project-wide operating rules when
     `doc/playbook.md` does not exist or the note is not a playbook-style trap.
     If no repo harness file exists, create repo-root `AGENTS.md`; do not fall back
     to the global memo for a repo-specific note.
3. If the note is cross-project, machine-level, or a personal workflow preference,
   append to `~/.codex/memo.md`.

When working inside a repo and unsure, prefer repo harness docs over the global
memo. Do not store project-specific mistakes in `~/.codex/memo.md` only because
the underlying lesson also applies elsewhere.

## Format

- Add a local timestamp heading such as `## 2026-06-03 14:20 KST`.
- Store short bullets with concrete facts.
- Start explicit user instructions with `Instruction:`.
- Include exact paths, commands, env vars, or identifiers when they matter.

## Safety

- Never store secret values, private keys, tokens, passwords, or full credential JSON.
- It is okay to store credential pointer paths and env var names.
- Do not dump long logs. Summarize the durable fact.

## Workflow

1. Identify the memo argument and target.
2. Read the target file if it exists.
3. Append or merge the smallest useful note; do not rewrite unrelated content.
4. Tell the user which file was updated.
