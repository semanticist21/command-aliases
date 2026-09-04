# Agent toolkit

- `skills/` is the single public source for managed skills.
- `agents/global/AGENTS.md` owns the global harness; `agents/user/AGENTS.md` owns public cross-project user context.
- Use `toolkit-sync` for structural changes, runtime synchronization, and drift checks.
- Keep system, plugin, and vendor skills outside this repository. `environment-sync` is the single owner of cross-machine bootstrap, private inputs, access profiles, and registered infrastructure recovery.
- Meaningful changes require validation, a secret/internal-detail scan, independent review, a VERSION bump, and verified runtime sync.
