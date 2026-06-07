---
name: corp-cert-update
description: Rotate managed TLS interception CA certs when expired or TLS errors return. Locates the active bundle, rebuilds it, and verifies. Companion to corp-cert-fix.
---

# Corp Cert Update (global)

Rotates the CA bundle that lets bun / node / pip / curl / etc trust corp MITM proxy. Project-agnostic. For the ts-start–specific flow, the project ships its own `update-cert` skill.

## Locate current cert

Check in order:
1. **Project-local:** look for `certs/*.pem`, `.envrc` mentioning `NODE_EXTRA_CA_CERTS`, `bunfig.toml` `cafile`.
2. **Global bundle:** `~/all-ca-certs.pem` (created by `corp-cert-fix` snippet).
3. **Env vars:** `echo $NODE_EXTRA_CA_CERTS $SSL_CERT_FILE $REQUESTS_CA_BUNDLE` — follow the path.

## Check expiry

```sh
openssl x509 -in <cert.pem> -noout -subject -enddate
# For a multi-cert bundle:
awk '/-----BEGIN/,/-----END/' <bundle.pem> | csplit -s -z -f cert- - '/-----BEGIN/' '{*}'
for f in cert-*; do openssl x509 -in "$f" -noout -subject -enddate; done
rm cert-*
```

Rotate if any required cert `notAfter` is past or within 30 days.

## Refresh from macOS keychain

```sh
# Single corp root (project-local style)
security find-certificate -c "<CA name>" -p /Library/Keychains/System.keychain > <target.pem>

# Full bundle (global style — used by corp-cert-fix snippet)
BUNDLE=~/all-ca-certs.pem
security find-certificate -a -p /System/Library/Keychains/SystemRootCertificates.keychain > $BUNDLE
security find-certificate -a -p /Library/Keychains/System.keychain >> $BUNDLE
```

Common CA names by proxy:
- KT ZTNA: `Kt Corporation Root CA`, `Kt Corporation Forward Trust CA`, `Kt Corporation Forward Trust CA ECDSA`
- Zscaler: `Zscaler Root CA`
- Palo Alto: `Palo Alto Networks Inc Forward Trust`
- Netskope: `Netskope Certificate Authority`

If keychain has multiple matches, pick the latest `notAfter`:
```sh
security find-certificate -a -c "<CA name>" -p /Library/Keychains/System.keychain | \
  awk '/-----BEGIN/,/-----END/' | csplit -s -z -f kc- - '/-----BEGIN/' '{*}'
for f in kc-*; do
  enddate=$(openssl x509 -in "$f" -noout -enddate | cut -d= -f2)
  echo "$enddate  $f"
done | sort -r | head -1
```

## "Bundle suddenly stopped working" diagnostic

If `~/all-ca-certs.pem` exists, was working, now fails:
1. Check freshness: `stat -f "%Sm" ~/all-ca-certs.pem` (macOS) — if older than IT's last cert rotation, the `find -mtime +1` snippet hasn't re-triggered. Force refresh: `rm ~/all-ca-certs.pem && exec zsh`.
2. Bundle stale despite recent mtime (someone `touch`ed it): same fix — `rm` and `exec zsh`.
3. ZTNA/VPN disconnected: keychain still has old cert; reconnect first, then refresh.
4. **bun upgraded recently?** Check `bun --version`:
   - `1.3.0` / `1.3.1` — broken system CA loading (#23735). Use `NODE_EXTRA_CA_CERTS`, or upgrade to ≥1.3.2.
   - `≥ 1.3.2` — `NODE_EXTRA_CA_CERTS` alone may be ignored on Linux (#24581). Add `NODE_USE_SYSTEM_CA=1`. On macOS, drop the bundle entirely and use `NODE_USE_SYSTEM_CA=1` alone.
5. Bun cafile reminder: even with valid bundle, bunx ignores `bunfig.toml [install] cafile`. Test: `echo $NODE_USE_SYSTEM_CA $NODE_EXTRA_CA_CERTS`.

## If cert not in keychain

- User isn't on the corp network right now (VPN/ZTNA off) — reconnect, retry.
- IT hasn't pushed the new cert yet — request from IT helpdesk.
- Wrong keychain — also check `~/Library/Keychains/login.keychain-db`.

## Verify

Per-runtime smoke tests (run whichever matches user's stack):
```sh
# bun
NODE_EXTRA_CA_CERTS=<bundle> bunx --bun cowsay@latest hi
# node
NODE_EXTRA_CA_CERTS=<bundle> node -e 'fetch("https://registry.npmjs.org/npm").then(r=>console.log(r.status))'
# curl
curl --cacert <bundle> https://registry.npmjs.org/npm -o /dev/null -w "%{http_code}\n"
# pip
SSL_CERT_FILE=<bundle> pip install --dry-run requests
```

Expect 200 / no SSL error.

## Update references

- Project: replace cert file in `certs/`, bump expiry note in `README.md`, commit.
- Global bundle: file is regenerated in place; `corp-cert-fix` shell snippet auto-detects via `find -mtime +1`. If user wants forced refresh: `rm ~/all-ca-certs.pem && exec zsh`.
- direnv: no change needed (env var path stable).
- Docker images: rebuild after copying new cert in.

## Companion skills

- `corp-cert-fix` — initial setup, runtime-specific options, anti-patterns.
- (project-local) `update-cert` — ts-start–specific shortcuts.
