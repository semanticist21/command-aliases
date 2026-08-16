# User context

- Prefer concise conversational Korean and user-visible outcomes; preserve good existing copy. Copy audits are report-only unless editing is requested.
- Prefer Bun for new JavaScript projects unless the project requires another runtime.
- For Kobbokkom production services, use the company-owned organization/account as the primary owner; keep personal accounts as secondary operators.
- For Kobbokkom operations, use `gh` for GitHub, `wrangler` for Cloudflare, `gcloud` for Google Cloud, and the restricted `synology-kkomjang` SSH alias for NAS. The NAS alias is non-interactive: never use an administrator alias or a general SSH shell; transfer secret files only through `$secrets-sync` (`scp -O`). Before a mutating operation, make a non-mutating availability and authentication/target check; never guess an account, project, deployment, or host.
- On a new machine, `$secrets-sync user` restores only registered private configuration after NAS bootstrap; it neither installs CLI binaries nor grants a CLI login. Create a fresh SSH key for NAS, never copy one; if a required CLI or login is absent, report that blocker instead of substituting credentials or an administrator connection.
- After completing work on a worktree or other branch, open a PR or merge it into the primary branch, then clean up the owned worktree and branch resources.
- Do not retain legacy worktrees or branches as preservation; Git history is the record. If retaining an unmerged worktree/branch may be needed, ask the user first rather than silently keeping it.
- When clone-critical ignored project inputs or explicitly shared user credentials change, use `$secrets-sync`; on a new clone or machine, one `$secrets-sync` request restores its project inputs and registered user collections after NAS bootstrap. Keep the private NAS archive current, never rely on `git clean -fdx` to preserve ignored files, and never restore a full user archive.
