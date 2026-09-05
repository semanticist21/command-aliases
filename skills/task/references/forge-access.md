# Unified GitHub and Forgejo access

Use one user-facing workflow: resolve the repository, check access, perform the
requested operation, and verify its result. Select the provider tools internally;
the user need not choose a CLI for each request. This is shared agent behavior,
not a new executable or a claim that the two APIs have identical commands.

## Resolve the target before access

Use the requested repository, its canonical registration and effective Git fetch
and push configuration, including upstream, push URLs and push-remote overrides.
Verify the provider, instance, owner/repository and branch. `origin` is a name,
not proof of authority; an SSH alias, API hostname or logged-in default can differ
from the registered transport. Ask one focused question only if targets conflict.
Never rewrite unrelated remotes, migrate project code because toolkit moved, or
apply toolkit's source-handoff helper to an ordinary project.

| Operation | GitHub | Forgejo |
| --- | --- | --- |
| Clone, fetch, pull, commit, push | `git` | `git` |
| PR, issue, release and repository API | `gh` | registered `fj` user client |

For Git writes, name the verified remote and branch explicitly. For API calls,
select the verified instance and repository explicitly; use the installed CLI's
help rather than translating flags by analogy. Verify PR base/head repositories,
refs and permissions before publishing or merging. Keep the user's existing
repository placement and distinct forge identities; sharing a workflow does not
mean sharing tokens, accounts or credentials. GitHub CLI success does not prove
Forgejo access, and API success does not prove Git push authority.

## Recovery and publication boundaries

For missing tools, profiles or credentials, use Environment Sync's
[registered client recovery](../../environment-sync/references/git-source-recovery.md).
Apply the selected environment's transport, including Tailscale when registered;
do not require every GitHub repository to use the private network. A Git-only
operation does not require an API credential. Restore only the selected target's
access, preserve other logins, and keep interactive approvals explicit.

Before publishing non-public context, verify that the destination repository is
actually private and that no public mirror/distribution receives those files.
Forgejo hosting alone is not privacy. Secrets stay outside Git; public toolkit
distribution never receives private context. An unavailable forge is a scoped
blocker, not permission to send its content or work to another provider.
