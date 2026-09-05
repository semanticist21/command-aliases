# Git source recovery

Read when a canonical Git host changes, source metadata conflicts with a local
checkout, or access to the registered private source must be restored. Read
[operations.md](operations.md) before a remote write or cutover.

## Required clients and recovery dependencies

The shared [forge workflow](../../task/references/forge-access.md) owns normal
GitHub/Forgejo operation routing. This procedure owns recovery of the selected
tools and access; it does not unify accounts or move repositories implicitly.

Resolve required tools from the selected environment's canonical tool declaration,
not from a universal package list. Distinguish Git transport (`git` plus the
registered SSH/HTTPS path) from a forge user CLI for repository metadata, pull
requests or releases, and from a server administrator executable. A Git-only
operation does not require a forge CLI or its API credential. Register the
approved user client when selected management operations need it; do not infer
that a similarly named binary is the intended tool.

Restore a missing required client through its declared trusted installation and
version policy. Verify executable identity, the explicitly selected instance and
account, and a harmless API read of the intended resource. Verify Git transport
separately; an installed binary, browser login or successful API read proves
neither Git write authority nor permission for unrelated administrative actions.
Keep concrete endpoint/auth mappings private and credentials in their registered
protected storage. Preserve unrelated profiles; request only unavoidable approval.

For a self-hosted forge, explain the registered recovery dependencies and honor
the owner's declared recovery policy. Do not require an additional Git snapshot
or backup when the owner has chosen Git-only declarations. Git history and RAID
do not by themselves provide an independent copy; report actual source
unavailability without inventing redundancy or relocating services. An optional
snapshot is recovery input, not fresh remote state or capture authority. A
Git-only declaration policy does not waive separately registered secret or
stateful application recovery requirements or authorize deleting existing data.

## Canonical source changes

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

Update and verify the owning source metadata and consumers, including a served
bootstrap snapshot only when that environment registers one, through its
publication procedure. Re-resolve the canonical
revision and re-read current declarations after restoration. Preserve divergent
local commits, old repositories and rollback until the explicit retirement
criteria pass. If source evidence conflicts or cutover is incomplete, report
that exact dependency while continuing unrelated verified recovery.

Moving Git storage does not automatically migrate Actions runners, runner groups,
webhooks, packages, issues or secret consumers. Keep existing provider-specific
workflows and recovery contracts unless their separate migration is authorized.
