---
name: toolkit-sync
description: Create, update, compact, rename, delete, validate, and synchronize the public agent toolkit across supported runtimes.
---

# Toolkit sync

Environment selection follows Environment Sync's
[selection and setup procedure](../environment-sync/references/environment-selection.md).
Shared hosts select their registered organization; new ordinary machines default
to personal. Organization access requires an explicit request or a durable
user-declared device default, not merely a saved profile or active login. Critical probes
belong only to the selected baseline. Personal use does not implicitly require
an organization anchor. The file-copy phase itself does not grant shared-host
status; only an explicit Environment Sync `setup` request does so.

Public source is `semanticist21/agent-toolkit`. Canonical managed skills live in `skills/`; Codex, Claude, and OpenCode copies and version markers must match it. Run `scripts/toolkit-sync check` before writes and `scripts/toolkit-sync sync` after landing. Complete and verify this public runtime-copy phase before private bootstrap; an unavailable private anchor must not suppress or roll back a valid toolkit update. After a live sync, invoke plain `$environment-sync` using the selection rules above and include the current machine. The overall toolkit workflow remains incomplete until every critical SSH target and shared managed host in the selected baseline passes its registered cache-independent isolated no-ticket administrative probe, with a successful exit and stdout exactly `0`. Use an explicit scope or direction only when the caller intentionally needs to constrain reconciliation. The file-copy script remains environment-agnostic and transactional; the invoking agent owns this environment phase and reports the public phase and any partial environment readiness separately.

`agents/global/AGENTS.md` owns the global harness; keep `~/.codex/AGENTS.md` and `~/.claude/CLAUDE.md` linked to it. `agents/user/AGENTS.md` owns public shared user context; keep `~/.agents/doc/AGENTS.md` linked to it. If the user path is a regular file, preserve it as `AGENTS.local.md` only when that overlay is absent; otherwise stop without changing either file. Never publish its content without explicit approval and a secret scan.

Keep `~/.agents/doc/AGENTS.local.md` machine-local and never copy, merge, publish, overwrite, or synchronize it. Keep the optional private companion separate and verify its identity and private visibility before Git operations. Never store credentials, account identifiers, hosts, private keys, or secret-file paths in public context.

Outside an explicit Environment Sync `setup`, Tailscale installation and
interactive authentication are user prerequisites. Setup may install the
registered client; unavoidable interactive authentication still requires the user.
Environment Sync must also verify the intended Tailnet: login with an approved
account can still leave a device on a different network. Delegate target
verification and connection recovery to its machine-bootstrap procedure,
including a local continuation path before a potentially disconnecting switch.
Do not stop at an anchor count of zero or label it an outage or ACL fault without
that diagnosis. If target evidence is unavailable before private bootstrap,
request the intended Tailnet once from the owner rather than inventing it or
depending on the unreachable anchor to supply it. Bootstrap may enroll only a
fresh device key's public half. Environment Sync's registered private baseline
owns concrete targets and uses a management account plus a platform-validated
cache-independent non-interactive sudo probe, never direct root SSH. A private
shared-host registration requires Environment Sync to maintain that dedicated
account's non-interactive sudo capability; it must not grant it to an
unregistered machine or runner identity. During this environment phase it must
not invoke toolkit
synchronization or modify toolkit-managed sources and runtime copies.

Before writes, inventory the public source, private companion when present, runtime copies, and drift direction; use a clean fetched-base worktree. Never let synchronization delete an unmanaged skill. Third-party skills stay vendor-local unless the user explicitly requests incorporation and licensing permits it. Cross-machine environment, private-input, access, and infrastructure recovery belongs to `environment-sync`.

Deletion or rename requires a second confirmation naming skills, runtimes, and public/local sides. Meaningful changes require independent read-only review, secret/internal-detail and license scans, a VERSION bump, explicit commit/push as `semanticist21`, merge, live sync, and zero residual drift.
