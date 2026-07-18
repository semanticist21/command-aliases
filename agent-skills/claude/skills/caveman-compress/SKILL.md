---
name: caveman-compress
description: >
  Compress natural language memory files (CLAUDE.md, todos, preferences) into caveman format
  to save input tokens. Preserves all technical substance, code, URLs, and structure.
  Compressed version overwrites the original file. Human-readable backup saved as FILE.original.md.
  Trigger: /caveman-compress FILEPATH or "compress memory file"
---
# Caveman Compress

Compress a durable instruction/memory file into terse “caveman” prose without losing operational meaning.

## Process

1. Resolve one explicit prose/instruction input (`.md`, `.txt`, `.rst`, todo/preference, or extensionless); reject code, config, lock, env, binary, generated, secret, and ambiguous-glob files. Read it completely.
2. From this skill directory run `scripts/__main__.py <file>` when available; otherwise perform the same transformation carefully.
3. Save the original beside it as `<file>.original.md` before overwriting. Do not overwrite an existing backup without user approval.
4. Re-read the result and compare against the source. Report path, before/after lines or tokens, and any wording intentionally kept verbose.

## Compression rules

- Preserve exactly: code regions in mixed prose, commands, paths, URLs, identifiers, versions, numbers, dates, tables where structure matters, hard constraints, negations, ownership, and ordering/dependency rules.
- Keep headings and lists when they encode scope; merge repetition, examples, rationale, pleasantries, duplicated warnings, and obvious transitions.
- Use short imperative fragments, stable keywords, arrows, and compact labels. Never make a prohibition optional or turn a condition into an unconditional instruction.
- Do not change meaning, add policy, translate technical content, expose secrets, or compress a file whose nuance is legally/safety critical without flagging the risk.

Return the compressed content or confirm the file update; offer the backup for rollback.
