---
name: toolkit-sync
description: Create, update, compact, rename, delete, validate, and synchronize the public agent toolkit across supported runtimes.
---

# Toolkit sync

Public source is `semanticist21/agent-toolkit`. Canonical managed skills live in `skills/`; Codex, Claude, and OpenCode copies and version markers must match it. Run `scripts/toolkit-sync check` before writes and `scripts/toolkit-sync sync` after landing. After a live sync, invoke plain `$environment-sync`; it autonomously selects the applicable registered environment. The toolkit workflow is incomplete until every private-baseline critical SSH target passes its registered root-capability probe. Use an explicit scope or direction only when the caller intentionally needs to constrain reconciliation. The file-copy script remains environment-agnostic and transactional; the invoking agent owns this environment phase and reports partial completion precisely.

`agents/global/AGENTS.md` owns the global harness; keep `~/.codex/AGENTS.md` and `~/.claude/CLAUDE.md` linked to it. `agents/user/AGENTS.md` owns public shared user context; keep `~/.agents/doc/AGENTS.md` linked to it. If the user path is a regular file, preserve it as `AGENTS.local.md` only when that overlay is absent; otherwise stop without changing either file. Never publish its content without explicit approval and a secret scan.

Keep `~/.agents/doc/AGENTS.local.md` machine-local and never copy, merge, publish, overwrite, or synchronize it. Keep the optional private companion separate and verify its identity and private visibility before Git operations. Never store credentials, account identifiers, hosts, private keys, or secret-file paths in public context.

Tailscale installation and login are user prerequisites. Report either absence
instead of installing it or selecting an account. Bootstrap may enroll only a
fresh device key's public half. Environment Sync's registered private baseline
owns concrete targets and uses a management account plus `sudo -n`, never
direct root SSH. During this environment phase it must not invoke toolkit
synchronization or modify toolkit-managed sources and runtime copies.

Before writes, inventory the public source, private companion when present, runtime copies, and drift direction; use a clean fetched-base worktree. Never let synchronization delete an unmanaged skill. Third-party skills stay vendor-local unless the user explicitly requests incorporation and licensing permits it. Cross-machine environment, private-input, access, and infrastructure recovery belongs to `environment-sync`.

Deletion or rename requires a second confirmation naming skills, runtimes, and public/local sides. Meaningful changes require independent read-only review, secret/internal-detail and license scans, a VERSION bump, explicit commit/push as `semanticist21`, merge, live sync, and zero residual drift.
