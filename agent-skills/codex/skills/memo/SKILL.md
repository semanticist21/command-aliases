---
name: "memo"
description: "Save the user's memo argument as a durable note in the right scope. Use when the user invokes $memo, says memo/save this note/remember this, or asks to persist an instruction, preference, follow-up, pitfall, agent mistake, environment fact, or reusable reminder; discover and follow the current repo's durable-doc harness for repo-specific notes, and use the global memo only for truly cross-project facts."
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
2. If the note concerns the current repo, first discover that repo's durable-doc
   harness and follow it. Read the nearest relevant instruction files before
   choosing a target; common candidates include local/root `AGENTS.md`, `CLAUDE.md`,
   a docs index, playbook, handoff, or status file, but do not hardcode one
   project's layout as universal. If multiple harness targets exist, obey the
   repo's documented precedence; otherwise choose the narrowest target that future
   agents are likely to read.
3. Route repo-specific notes by scope:
   - Subtree-specific rule, setup quirk, ownership boundary, implementation gotcha,
     or agent mistake: use the repo's local instruction mechanism for that subtree.
   - Project-wide repeatable trap, debugging lesson, or agent mistake: use the repo's
     harness target for durable lessons or playbooks.
   - Project-wide operating rule: use the repo's harness target for agent
     instructions.
   If no harness exists, create the smallest conventional repo-local note that future
   agents are likely to read, usually repo-root `AGENTS.md`. Do not fall back to the
   global memo for a repo-specific note.
4. If the note is cross-project, machine-level, or a personal workflow preference,
   append to `~/.codex/memo.md`.

When a repo issue reveals a generally useful lesson, write the repo-specific fact
locally first. Add a global memo only if the lesson remains useful after removing
project names, paths, product choices, and local conventions.

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
