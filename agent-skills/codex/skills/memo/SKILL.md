---
name: memo
description: Save the user's memo argument as a durable note. Use when the user invokes $memo, says memo/save/remember this, or asks to persist an instruction, preference, follow-up, pitfall, environment fact, or reusable reminder.
user-invocable: true
argument-hint: "<note to persist>"
metadata:
  short-description: Save durable notes from a memo argument
---

# Memo

Save the memo argument the user provided. Treat the argument as the source of truth:
preserve exact paths, identifiers, commands, and constraints. Rephrase only enough to
make the stored note compact and useful.

## Target selection

1. If the user gives an explicit target path, write there.
2. If the note is specific to the current repo, write to the nearest relevant
   `AGENTS.md` when one exists.
3. If the repo has the harness durable-docs structure and the note is a repeatable
   trap/gotcha, append to `doc/playbook.md`.
4. If the note is cross-project, machine-level, or a personal workflow preference,
   append to `~/.codex/memo.md`.

When unsure, prefer `~/.codex/memo.md` for broad user preferences and repo
`AGENTS.md` for project-specific operating rules.

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
