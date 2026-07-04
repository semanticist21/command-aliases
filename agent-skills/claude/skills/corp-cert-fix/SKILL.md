---
name: corp-cert-fix
description: "Fix managed-proxy TLS errors: SELF_SIGNED_CERT_IN_CHAIN, CERTIFICATE_VERIFY_FAILED, CA setup."
---
# Corp Cert Fix

Corporate MITM proxies (KT ZTNA, Zscaler, Palo Alto SSL Forward Proxy, Netskope) re-sign all outbound HTTPS with a private CA. The OS keychain trusts it (IT installed); language runtimes with their own bundled CA stores do not. Result: `SELF_SIGNED_CERT_IN_CHAIN` / `CERTIFICATE_VERIFY_FAILED`.

## Diagnose

1. Confirm MITM is in play:
   ```sh
   openssl s_client -connect registry.npmjs.org:443 -servername registry.npmjs.org < /dev/null 2>&1 | grep -E "subject=|issuer="
   ```
   If `issuer=` shows a corp CA (e.g. `Kt Corporation Forward Trust CA`, `Zscaler`, `Palo Alto`), MITM confirmed.

2. Identify failing runtime from the error message:
   | Runtime | Typical error origin |
   |---|---|
   | bun / bunx | `error: SELF_SIGNED_CERT_IN_CHAIN downloading package manifest` |
   | node / npm / pnpm | `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` |
   | pip / uv / poetry | `SSLError ... self-signed certificate in certificate chain` |
   | curl | `SSL certificate problem` |
   | azure cli | `SSLError` (uses requests internally) |

## Fix — fast path for modern toolchains (try first)

Most current runtimes can read the OS trust store directly. If IT already installed the corp CA in the macOS keychain (typical) or Linux system store, set:

```sh
export NODE_USE_SYSTEM_CA=1   # bun ≥1.3.2, node 22+
export UV_NATIVE_TLS=1        # uv (any version)
```

No PEM file, no bundle, no rotation script. Covers most cases. If a tool in your stack doesn't support OS-trust reads (older node, pip, curl, git, docker), fall through to the bundle approach below.

## Fix — universal bundle approach (fallback)

Build one bundle from macOS keychain (auto-rebuilds when IT rotates cert):

Append to `~/.zshrc` (or `~/.bashrc`):
```sh
# Corp MITM cert bundle (auto-refresh daily)
BUNDLE=~/all-ca-certs.pem
if [[ ! -f $BUNDLE || $(find $BUNDLE -mtime +1 2>/dev/null) ]]; then
  security find-certificate -a -p /System/Library/Keychains/SystemRootCertificates.keychain > $BUNDLE
  security find-certificate -a -p /Library/Keychains/System.keychain >> $BUNDLE
fi
export NODE_EXTRA_CA_CERTS=$BUNDLE
export SSL_CERT_FILE=$BUNDLE
export REQUESTS_CA_BUNDLE=$BUNDLE
export CURL_CA_BUNDLE=$BUNDLE
```

Covers:
- node / npm / pnpm / yarn / bun / bunx (via `NODE_EXTRA_CA_CERTS`)
- pip / uv / requests / python (via `REQUESTS_CA_BUNDLE` < py3.12, `SSL_CERT_FILE` ≥ py3.12)
- curl (`CURL_CA_BUNDLE`)
- openssl-linked tools (`SSL_CERT_FILE`)

Linux: replace `security find-certificate ...` with `cat /etc/ssl/certs/ca-certificates.crt` (Debian/Ubuntu) or `/etc/pki/tls/certs/ca-bundle.crt` (RHEL). Ensure corp CA was added via `update-ca-certificates` first.

## Runtime-specific notes

> **Note:** sections below list multiple options per runtime. Adapt to the user's environment — check what's already installed (pip vs uv vs poetry, npm vs bun vs pnpm, direnv presence, OS, Python version, Node version, CI vs local) before recommending. None of the named tools are mandatory; pick the path with least friction for that user's stack.


### bun

Version-dependent — check `bun --version`:

| bun version | Best knob |
|---|---|
| ≥ 1.3.2 (current) | `NODE_USE_SYSTEM_CA=1` alone. bun reads OS trust store (macOS keychain / Linux ca-certificates). No PEM file needed if IT already pushed cert to system trust. |
| 1.3.0 – 1.3.1 | Broken system CA (regression #23735). Use `NODE_EXTRA_CA_CERTS=path/to/corp-ca.pem`. |
| ≤ 1.2.x | `NODE_EXTRA_CA_CERTS` works for both `bun install` and `bunx`. |

Known bugs:
- `bunfig.toml [install] cafile` applies to `bun install` only — `bunx` ignores it (#17325, #11821).
- bun 1.3.2+ Linux: `NODE_EXTRA_CA_CERTS` alone may not work; combine with `NODE_USE_SYSTEM_CA=1` (#24581). On macOS this usually isn't needed.
- Linux requires the CA to actually be in `/etc/ssl/certs/ca-certificates.crt` (run `update-ca-certificates` after dropping the PEM into `/usr/local/share/ca-certificates/`).

### node
- Node 22+ : `NODE_USE_SYSTEM_CA=1` (env var) or `NODE_OPTIONS="--use-system-ca"`. No PEM needed.
- Older node: `NODE_EXTRA_CA_CERTS=path/to/corp-ca.pem`.

### pip / uv
- **uv-specific (cleanest):** use native (Rustls reads OS trust store):
  ```sh
  export UV_NATIVE_TLS=1            # or pass --native-tls per call
  ```
  No CA bundle / no pip_system_certs needed.
- Universal: install `pip_system_certs` into venv → reads system keychain at runtime.
  ```sh
  pip install pip_system_certs       # one-off, no project
  uv pip install pip_system_certs    # into active env
  uv add pip_system_certs            # add to project deps
  ```
- Env var fallback: `REQUESTS_CA_BUNDLE` (py≤3.11), `SSL_CERT_FILE` (py≥3.12).
- Python 3.13: env vars may not work — use `UV_NATIVE_TLS=1` or install `pip_system_certs`.

### azure cli (packaged python)
- Env vars do not reach packaged python on py 3.13+.
  ```sh
  # Apple Silicon
  /opt/homebrew/Cellar/azure-cli/*/libexec/bin/python -m pip install pip_system_certs
  # Intel
  /usr/local/Cellar/azure-cli/*/libexec/bin/python -m pip install pip_system_certs
  ```

### claude code / codex (Bun-native binaries)
- Set `NODE_EXTRA_CA_CERTS` in shell rc before launching.

### git
```sh
git config --global http.sslCAInfo $BUNDLE
```

### docker
- Bundle must be injected into image. Common pattern:
  ```dockerfile
  COPY corp-ca.pem /usr/local/share/ca-certificates/corp-ca.crt
  RUN update-ca-certificates
  ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/corp-ca.crt
  ```

## DO NOT

- `NODE_TLS_REJECT_UNAUTHORIZED=0` — disables ALL TLS verification, real MITM attacks succeed. Only acceptable as a one-shot debug, never in shell rc.
- `pip install --trusted-host` — same problem at app layer.

## Cert rotation

Corp root CAs typically valid 1–5 years (KT = 2 years). IT pushes renewal to keychain automatically; the auto-refresh `find -mtime +1` in the shell snippet picks up the new cert next day. No manual action needed unless the bundle file timestamp gets stuck.

## CI / containers

Keychain approach is local-only. For CI:

- **GitHub-hosted runners / cloud CI on public egress:** cert usually NOT needed — the runner is on Microsoft/AWS network, not behind the user's corp proxy. Only needed if (a) self-hosted runner on corp network, or (b) hitting an internal registry that uses a private CA.
- **Self-hosted runner behind corp proxy:** commit corp CA `.pem` to repo (org-public, not secret). Workflow:
  ```yaml
  env:
    NODE_USE_SYSTEM_CA: "1"                                           # bun ≥1.3.2, node 22+
    NODE_EXTRA_CA_CERTS: ${{ github.workspace }}/certs/corp-ca.pem    # belt-and-suspenders (#24581)
    SSL_CERT_FILE: /etc/ssl/certs/ca-certificates.crt                 # python/curl/openssl
    UV_NATIVE_TLS: "1"                                                # if using uv
  ```
  Set both `NODE_USE_SYSTEM_CA` and `NODE_EXTRA_CA_CERTS` on Linux: bun 1.3.2+ ignores `NODE_EXTRA_CA_CERTS` alone (#24581), and a stale runner image may lack the cert in system store.
- **Ubuntu system trust** (for tools that read it, e.g. curl/git/apt):
  ```sh
  sudo cp certs/corp-ca.pem /usr/local/share/ca-certificates/corp-ca.crt
  sudo update-ca-certificates
  ```
- **Private registry auth + CA together** (bunfig.toml / .npmrc):
  ```toml
  # bunfig.toml
  [install]
  cafile = "./certs/corp-ca.pem"
  registry = "https://npm.corp.internal/"
  [install.scopes]
  "@corp" = { token = "$NPM_TOKEN", url = "https://npm.corp.internal/" }
  ```
- **Docker:**
  ```dockerfile
  COPY certs/corp-ca.pem /usr/local/share/ca-certificates/corp-ca.crt
  RUN update-ca-certificates
  ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/corp-ca.crt
  ```

## Project-local setup pattern

If team uses direnv:
```sh
# .envrc (committed)
export NODE_EXTRA_CA_CERTS="$(pwd)/certs/corp-ca.pem"
```
Otherwise, document the global shell snippet in README and rely on each dev's `~/.zshrc`.
