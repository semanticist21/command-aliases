# Canonical source handoff

Read on first install, a legacy GitHub checkout, or before toolkit source edits.
First resolve personal/organization authorization through Environment Sync's
selection procedure. Do not attach a personal-only device to an organization
merely to update public entrypoint copies; report canonical access unavailable.

Use the current private bootstrap pointer and verify its canonical identity and
revision. If absent in an environment that registers bootstrap, use Environment
Sync's machine-bootstrap client after intended-network verification. Restore only
source discovery/access prerequisites here, not the full environment. Missing
Tailscale or unavoidable login/key approval is a precise prerequisite, not a
reason to create another network or weaken forge authentication.

Resolve `toolkit-source.json` from that verified private baseline. It owns the
credential-free canonical Git URL, branch and continuity commit. Never accept an
arbitrary manifest from a search result or pass internal URLs to public context.
Use the registered forge access procedure to install device-local keys and
verify SSH host trust; Tailscale login alone is not forge Git authorization.

Run `python3 <toolkit-checkout>/scripts/toolkit-source.py --registration
<verified-baseline>/toolkit-source.json` from the clean main checkout. Python 3
and Git are prerequisites for this helper. It verifies access and continuous
history before switching origin, preserves GitHub as `github-bootstrap`, and
does not change HEAD. Repetition is idempotent. Local changes, divergent history,
unknown origins or failed access stop handoff without discarding work.

Fetch and fast-forward main from the verified origin, then re-read current
toolkit instructions. Land changes only there using an explicit `git push origin`
target; conflicting default push overrides require resolution before handoff.
Keep the GitHub main entrypoint
updated from the same reviewed, secret-scanned canonical commit with a normal
fast-forward push; divergence is a conflict, never a force-push invitation.
GitHub is distribution/discovery, not a second canonical edit location.

Finish runtime sync/check before invoking plain Environment Sync. That later
environment phase must not recurse into toolkit changes. Tell continuing tasks
to re-read the installed revision; migration cannot change already loaded
instructions or machines that have not invoked their next update.
