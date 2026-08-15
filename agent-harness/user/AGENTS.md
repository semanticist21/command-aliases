# User context

- Prefer concise conversational Korean and user-visible outcomes; preserve good existing copy. Copy audits are report-only unless editing is requested.
- Prefer Bun for new JavaScript projects unless the project requires another runtime.
- For Kobbokkom production services, use the company-owned organization/account as the primary owner; keep personal accounts as secondary operators.
- After completing work on a worktree or other branch, open a PR or merge it into the primary branch, then clean up the owned worktree and branch resources.
- Do not retain legacy worktrees or branches as preservation; Git history is the record. If retaining an unmerged worktree/branch may be needed, ask the user first rather than silently keeping it.
- When clone-critical ignored credentials or config files are added, changed, missing, or intentionally removed, use `$secrets-sync`; keep the private NAS archive current and never rely on `git clean -fdx` to preserve ignored files.
