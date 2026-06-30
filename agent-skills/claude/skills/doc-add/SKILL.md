---
name: doc-add
description: "Add durable AI-facing project documentation from a user-provided note. Use when the user invokes /doc-add or asks to record new guidance, corrected assumptions, setup quirks, local conventions, gotchas, ownership notes, or future-agent context in the nearest appropriate AGENTS.md or docs file."
---

# Doc Add

Use this skill when the user provides new information that future AI agents should reference.

## Input Shape

`/doc-add [content to add or modify for future AI agents]`

The bracket content is the source of truth. Preserve technical identifiers, paths, commands, and corrected facts exactly.

## Placement

1. Read repo-root `AGENTS.md`.
2. If the note applies only to a subtree, read the nearest nested `AGENTS.md` before editing.
3. Write to the most local applicable `AGENTS.md`.
4. If no local file exists and the note is useful for that subtree, create `AGENTS.md` there.
5. Use `docs/` only for user-facing project documentation, playbooks, architecture notes, or repeatable procedures.
6. Use `~/.codex/memo.md` only for cross-project or machine-level notes.

## Edit Rules

- Add short, factual, durable bullets under `## History`, latest first.
- Phrase self-corrections as the true rule plus `Why:` in one line.
- Avoid transient logs, vague progress, secrets, and chat-only narration.
- If the user asks to modify an existing rule, update the existing bullet instead of duplicating it.
- Keep folder-local `AGENTS.md` shape:

```markdown
## Purpose

1-3 lines.

## History

- YYYY-MM-DD: Durable note. Why: short reason when useful.
```

## Verification

After editing, read the changed section and confirm the note is local, durable, and not redundant. Run formatting/lint only when code or structured docs changed.
