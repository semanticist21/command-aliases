---
name: corp-cert-fix
description: "Fix managed-proxy TLS errors: SELF_SIGNED_CERT_IN_CHAIN, CERTIFICATE_VERIFY_FAILED, CA setup."
---
# Corp Cert Fix

Diagnose and repair managed-proxy TLS trust failures without disabling certificate validation.

1. Capture the exact error, runtime, command, URL/hostname, OS, and whether a managed proxy/VPN is active. Inspect the certificate chain with safe read-only tools; distinguish missing corporate CA from expiry, hostname mismatch, server misconfiguration, or unrelated auth/network failure.
2. Prefer installing the approved corporate root/intermediate CA in the OS trust store through documented IT tooling. Verify issuer, fingerprint, expiry, and provenance; never trust a certificate copied from an unverified endpoint.
3. If the runtime needs a bundle, create/update an approved PEM bundle and point only that runtime at it: Node/Bun `NODE_EXTRA_CA_CERTS`, Python `REQUESTS_CA_BUNDLE`/`SSL_CERT_FILE`, Git `http.sslCAInfo`, Docker daemon/client config, or the tool’s documented CA variable. Keep paths outside repos and secrets out of logs.
4. Re-run the failing command and a minimal TLS check. Confirm normal public certificates still validate. Scope project/CI settings deliberately; do not commit private CA material unless the organization explicitly requires a public-safe distribution mechanism.

Never use `--insecure`, `GIT_SSL_NO_VERIFY`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, blanket CA bypasses, or silent global replacement of system bundles. For CA rotation, refresh from the approved source, atomically replace the bundle, verify fingerprint/expiry, and rerun checks. Report root cause, affected runtime, safe fix, verification, and renewal owner.
