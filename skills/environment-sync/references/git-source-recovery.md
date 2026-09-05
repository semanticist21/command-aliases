# Git source recovery

Read when a canonical Git host changes, source metadata conflicts with a local
checkout, or access to the registered private source must be restored. Read
[operations.md](operations.md) before a remote write or cutover.

A GitLab-to-Forgejo migration in progress is not a completed source switch.
Resolve the migration owner, approved source/destination and cutover state from
trusted registration and verified repository evidence. Keep the incumbent as
authority until the declared cutover is verified; an available new login page
or a second repository is not enough. Do not select by product name or whichever
remote responds first, and do not create competing writers during migration.

At the approved cutover, verify repository identity, private visibility,
required refs/commit history and actual clone/fetch access for the recovering
machine's registered account. Verify write permission only when capture requires
it, with provider-supported inspection or an explicitly approved disposable
ref; do not infer write access from a successful read. Git history owns portable
changes; do not invent a second manifest for ordinary Git-managed declarations.
Secret archive integrity metadata remains separate and is not retired by a
forge migration.

Resolve provider-specific credentials, scopes, endpoints and SSH host trust
from private registration/archive. A GitLab token/helper/API is not implicitly
valid for Forgejo, and browser login alone does not prove Git access. Recover
only the registered account's intended permissions; never put credentials or
concrete account/host values in public toolkit instructions.

Update and verify the owning source metadata, consumers and served bootstrap
snapshot through the registered publication procedure. Re-resolve the canonical
revision and re-read current declarations after restoration. Preserve divergent
local commits, old repositories and rollback until the explicit retirement
criteria pass. If source evidence conflicts or cutover is incomplete, report
that exact dependency while continuing unrelated verified recovery.

Moving Git storage does not automatically migrate Actions runners, runner groups,
webhooks, packages, issues or secret consumers. Keep existing provider-specific
workflows and recovery contracts unless their separate migration is authorized.
