# Registered management-key recovery

Use only when the selected private access profile explicitly registers the
anchor's management enrollment capability for a fixed non-root management
account. Ordinary personal sync and baseline archive enrollment do not grant it.

After verifying the selected Tailnet and anchor, invoke the installed bundled
bootstrap client with `management-enroll`; `management-rotate` and
`management-revoke` affect only that management key. These actions use a separate
device-local Ed25519 key and the fixed `/v1/enroll/management` endpoint. The
server accepts only the public key, never a caller-selected account, path,
command or key option. Keep the archive key and its enrollment unchanged.

The capability is disabled unless a protected server declaration selects the
management account and separate registry. Approved ordinary logins and exact
protected tagged-device bindings retain the same authenticated source/ID checks.
Management SSH keys are restricted to Tailscale source addresses. No direct root
SSH, copied private keys, proxy-header forgery or public bootstrap exposure.

Resolve the SSH endpoint, non-root account and trusted host key from the verified
private profile; configure an explicit identity and strict host-key checking.
Do not infer trust from `ssh-keyscan` alone. Verify direct SSH from the recovering
machine and its isolated no-ticket sudo probe with successful exit and stdout
exactly `0`. Enrollment success is not administrator readiness.
When the recovering machine is the target itself, additionally verify from a
distinct registered peer as required by [SSH readiness](ssh-readiness.md).

If the profile still requires an unavailable gateway or omits a declared target,
repair that registered source through an already authorized operator path; do
not stop at archive access or replace it with an ambient key. A missing server
capability or unavailable trusted operator is a precise incomplete-recovery
condition, not permission to broaden another endpoint. Preserve the anchor-local
recovery exception and keep unrelated service deployment dependencies separate.
