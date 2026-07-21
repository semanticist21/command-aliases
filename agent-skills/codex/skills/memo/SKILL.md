---
name: "memo"
description: "Save durable user or project notes when the user asks to memo, remember, or persist a preference — OR auto-call when the user states a durable fact, convention, gotcha, or correction mid-conversation that future agents should see. Auto-routes scope (user/project) by content."
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

Save a durable note the user provided or stated mid-conversation. Auto-call when the user voices a convention, gotcha, correction, ownership boundary, or setup quirk that future agents should see — even if they did not say "memo". Treat the note as the source of truth: preserve exact paths, identifiers, commands, and constraints. Rephrase only enough to make the stored note compact and useful.

## Scope auto-routing

Decide scope from the note's content, not from the user's phrasing:

- **Project scope** — when the note references the current repo's paths, files, commands, ownership, conventions, or gotchas. Route into the repo's harness (see "Target selection").
- **User scope** — when the note is a personal workflow preference, cross-project quirk, machine-level setup fact, or credential pointer. Route into `~/.agents/doc/` (see "Target selection" step 4).
- **Ambiguous** — if the note could be either, prefer project scope; a project doc is easier for the next agent in that repo to find. Mention the ambiguity to the user.

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
   shared machine-notes tree for a repo-specific note.
4. If the note is cross-project, machine-level, or a personal workflow preference,
   route it into the shared machine-notes tree at `~/.agents/doc/`. Read the ownership
   map `~/.agents/doc/AGENTS.md`, then append to the matching topic file (machine
   quirks, key/secret locations, release ops, infra, skills/prefs), or add a new topic
   file plus a row in that map and in the `~/.codex/AGENTS.md` "Machine Notes" index
   (which is symlinked to `~/.claude/CLAUDE.md`, so both runtimes see it). Do not grow
   `~/.codex/memo.md` — it is retired to a pointer.

When a repo issue reveals a generally useful lesson, write the repo-specific fact
locally first. Add a shared machine note (under `~/.agents/doc/`) only if the lesson
remains useful after removing project names, paths, product choices, and local
conventions.

## Format

- Match the target's existing convention: append a concise bullet under the relevant
  heading. Add a `## YYYY-MM-DD HH:MM KST` heading only for append-only log files, not
  for topic-organized notes like `~/.agents/doc/` or a repo `AGENTS.md`.
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
