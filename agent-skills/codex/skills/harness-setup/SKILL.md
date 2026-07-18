---
name: "harness-setup"
description: "Install agent workflow safety harnesses with changed-file guards and test/doc nudges."
---
# Harness Setup

Install or update repository-local agent safety harnesses: changed-file guards, task verification nudges, and concise instructions. Use only for harness work, not product code.

## Workflow

1. Read root/nested instructions, existing hooks/scripts/config, package tooling, and current CI. Inventory what already enforces changed-file, test, docs, and git safety; do not duplicate competing mechanisms.
2. Design the smallest compatible integration. Prefer project-native hooks/configuration, explicit changed-path checks, portable commands, useful errors, and opt-in/escape mechanisms only where repository policy permits.
3. Preserve existing ownership, branch/worktree rules, and CI behavior. Never add secret scanning exceptions, bypass verification, mutate user files, or make a broad destructive command a default.
4. Document invocation, prerequisites, expected output, and how guards distinguish required from N/A checks. Keep generated output out of source control unless project convention says otherwise.
5. Exercise success, failure, empty-diff, and relevant unsupported-package paths; run formatting/lint/test checks appropriate to touched files. Verify hooks do not block unrelated work or rely on machine-private paths.
6. Review the current diff independently for false negatives, false positives, unsafe shell/input handling, and documentation drift. Fix actionable findings and recheck.

Report installed/changed paths, enforcement behavior, verification, limitations, and any deliberately unguarded project flow.
