---
name: "corp-cert-fix"
description: "Fix managed-proxy TLS errors: SELF_SIGNED_CERT_IN_CHAIN, CERTIFICATE_VERIFY_FAILED, CA setup."
---
# Corporate Certificate Fix

Diagnose and repair managed-proxy TLS trust failures without disabling verification or exposing certificates/credentials.

## Diagnose first

- Capture exact command, client/runtime, endpoint class, error, and proxy/VPN context. Confirm whether failure is system trust, language runtime, Node/Python/Java/Go bundle, git/gh, Docker, or a custom `curl`/CA setting.
- Inspect certificate chain and current trust paths with read-only commands. Compare a known-good client when possible. Do not assume every TLS error is a missing corporate CA.
- Never use `NODE_TLS_REJECT_UNAUTHORIZED=0`, `--insecure`, broad certificate bypasses, or commit private CA material into a repo.

## Repair

1. Use the approved managed-proxy root/intermediate bundle and its documented machine note; verify provenance and expiry. Ask if no approved source is available.
2. Install/configure at the narrowest correct scope: system keychain only when needed; otherwise the affected tool/runtime's supported CA setting. Preserve existing bundles by appending/combining, never replace blindly.
3. Restart/reload only the affected process and verify the original command plus a normal trusted endpoint. Check that hostname validation remains enabled and no bypass environment variable persists.
4. Document the minimal durable setup/location in the machine note when authorized; keep certificate paths and internal hosts out of public repositories.

If trust errors recur after a CA rotation, route to `corp-cert-update`. Report root cause, scope changed, verification, and remaining failures.
