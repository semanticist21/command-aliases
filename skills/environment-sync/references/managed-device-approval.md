# Tagged shared-host bootstrap

Read during shared-host `setup`, or when an otherwise reachable organization
anchor returns 403 for a tagged managed host. Tags change the device's Tailscale
identity; an approved human's login is not retained as its authorization identity.
Do not misdiagnose this as a missing anchor or loosen account checks.

Ordinary untagged devices continue to use approved-login authorization, without
per-device approval. Tagged shared hosts need an explicit protected registration
binding their authenticated stable device ID and exact expected tag set. A tag,
hostname, copied registration or self-reported ID alone grants nothing.

During explicitly authorized setup, resolve the organization and shared-host
role from owner intent/private declarations. Compare the host's local device ID
and network with authenticated state from the registered anchor's management
path. Apply the exact registration through that already authorized admin path,
not through the public bootstrap endpoint. If no trusted operator path exists,
request the one operator action; do not require bootstrap to approve itself.

Keep concrete bindings in protected private registration, never public toolkit
or machine-local overlays. The private bootstrap source owns the procedure.
Preserve unrelated registrations and owner-only rollback state; validate config
before an atomic update. Repeating setup with identical verified bindings is a
no-op. Replacing a device identity or tag set requires renewed owner-authorized
setup; do not inherit approval by name. Removal denies subsequent bootstrap
requests; already enrolled SSH keys require their separate revocation procedure.

The localhost-only server binds the single source IP supplied by the trusted
Serve proxy and the requested stable device ID to live Tailnet state. Tagged
requests have no human identity headers, as documented by
[Tailscale Serve](https://tailscale.com/kb/1312/serve); require the exact registered
tag set instead of inventing a login. Reject forwarded-address chains and
conflicting identity headers. Account-owned nodes still require an approved
login matching the authenticated proxy identity. Unregistered tags/devices and
conflicting bindings fail closed. This does not
grant arbitrary tags, users, root SSH or new ACL permissions.

Before completing setup, prove discovery, snapshot and public-key enrollment
from the host itself, then its declared SSH/no-ticket sudo paths. Failure leaves
setup incomplete, even when registration or basic network access succeeded.
