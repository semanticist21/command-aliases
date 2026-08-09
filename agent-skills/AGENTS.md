# Agent Skills Mirror

- `claude/skills/<name>` and `codex/skills/<name>` mirror the matching user directories; keep runtimes independent.
- Use `skill-sync` for create/update/compact/rename/delete. Resolve local, mirror, and runtime drift before writing.
- Never publish local-private skills, Codex `.system/*`, `chronicle`, `ktbase-push`, or `corp-cert` unless the user explicitly names and authorizes them.
- Scan published changes for secrets, private hosts/IPs, credential paths, account IDs, and internal details.
- Deleting a skill requires a second confirmation naming skill, runtime, and mirror/local sides.
- A mirror content change bumps `VERSION`; update `README.md`, validate, commit, and push as GitHub user `semanticist21`, then restore the prior identity.
- Sync the landed mirror to both intended local runtimes and verify no residual drift.
