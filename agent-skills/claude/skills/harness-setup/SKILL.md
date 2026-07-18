---
name: harness-setup
description: "Install agent workflow safety harnesses with changed-file guards and test/doc nudges."
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Bash(git rev-parse*)
  - Bash(git status*)
  - Bash(git diff*)
  - Bash(git ls-files*)
  - Bash(ls*)
  - Bash(cat*)
  - Bash(node*)
  - Bash(test*)
---
# Agent Harness Setup

Install a minimal, project-appropriate agent safety harness in the target repository.

1. Locate the trusted repo, read all applicable instructions, inspect package/tooling/CI/hooks and existing agent docs. Never overwrite an existing harness without comparing it and preserving project-specific rules.
2. State the proposed level before writing: `lite` (instructions only), `standard` (instructions + changed-file/test/doc guard), or `full` (standard + CI/automation where supported). Ask when scope or authority is unclear.
3. Add concise durable docs in the project’s existing convention (root and local `AGENTS.md`/equivalent), ownership boundaries, changed-file awareness, verification expectations, and an instruction to record reusable local facts. Do not embed secrets, machine-specific paths, or transient logs.
4. Add hooks/scripts only when the repository’s package manager and CI make them reliable. Guards must be fast, non-destructive, bypassable only explicitly, and must not block unrelated workflows. Prefer warnings where false positives are likely.
5. Verify syntax, executable permissions, package scripts, hook behavior on a safe sample, and compatibility with existing CI. Review the diff for overreach, destructive commands, accidental recursion, and stale paths.

Report setup level, files, enforcement vs advisory behavior, verification, bypass/escalation path, and residual limitations. Keep the harness small; it should guide agents, not replace project tooling.
