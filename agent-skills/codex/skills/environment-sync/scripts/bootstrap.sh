#!/bin/sh

set -eu
umask 077

die() {
    printf 'secrets-sync: %s\n' "$1" >&2
    exit 1
}

need() {
    command -v "$1" >/dev/null 2>&1 || die "$1 is required"
}

action=${1:-bootstrap}
case "$action" in
    bootstrap|enroll|rotate|revoke) ;;
    *) die "usage: bootstrap.sh [bootstrap|enroll|rotate|revoke]" ;;
esac

[ -n "${HOME:-}" ] && [ "${HOME#/}" != "$HOME" ] || die "HOME must be an absolute path"
need curl
need cmp
need ln
need tar
need tailscale
[ "$action" = revoke ] || need ssh-keygen

agents_dir=$HOME/.agents
doc_dir=$agents_dir/doc
install_dir=$agents_dir/bootstrap
pointer=$doc_dir/AGENTS.local.md
ssh_dir=$HOME/.ssh
key_path=$ssh_dir/secrets-sync_ed25519

[ ! -L "$agents_dir" ] || die ".agents must not be a symbolic link"
[ ! -e "$agents_dir" ] || [ -d "$agents_dir" ] || die ".agents must be a directory"
mkdir -p "$agents_dir"
chmod 700 "$agents_dir"
temp_root=$(mktemp -d "$agents_dir/.secrets-sync.XXXXXX") || die "cannot create a private working directory"
cleanup() {
    [ -n "${temp_root:-}" ] && [ -d "$temp_root" ] && rm -rf -- "$temp_root"
}
trap cleanup EXIT HUP INT TERM

status_file=$temp_root/status.json
tailscale status --json >"$status_file" 2>/dev/null || die "cannot read authenticated Tailscale state"

parser=
if command -v python3 >/dev/null 2>&1; then
    parser=python3
elif command -v jq >/dev/null 2>&1; then
    parser=jq
elif [ "$(uname -s)" = Darwin ] && command -v osascript >/dev/null 2>&1; then
    parser=jxa
else
    die "JSON parsing requires python3 or jq (macOS may use its built-in osascript)"
fi

parse_status() {
    case "$parser" in
        python3)
            python3 - "$status_file" <<'PY'
import json, re, sys
with open(sys.argv[1], encoding="utf-8") as source:
    status = json.load(source)
peers = status.get("Peer", {})
if isinstance(peers, dict):
    peers = peers.values()
anchors = [p for p in peers if p.get("Online") is True and "tag:secrets-sync-anchor" in (p.get("Tags") or [])]
if len(anchors) != 1:
    raise SystemExit("anchor_count")
device_id = str((status.get("Self") or {}).get("ID") or "")
host = str(anchors[0].get("DNSName") or ((anchors[0].get("TailscaleIPs") or [""])[0])).rstrip(".")
if not re.fullmatch(r"[A-Za-z0-9._:-]{8,128}", device_id):
    raise SystemExit("device_id")
if not host or any(c in host for c in "/\\\t\r\n"):
    raise SystemExit("anchor_host")
print(device_id)
print(host)
PY
            ;;
        jq)
            count=$(jq -r '[.Peer[] | select(.Online == true and ((.Tags // []) | index("tag:secrets-sync-anchor")))] | length' "$status_file") || return 1
            [ "$count" = 1 ] || return 1
            jq -r '[.Self.ID, ([.Peer[] | select(.Online == true and ((.Tags // []) | index("tag:secrets-sync-anchor")))][0] | (.DNSName // .TailscaleIPs[0]) | sub("\\.$"; ""))] | .[]' "$status_file"
            ;;
        jxa)
            jxa_file=$temp_root/parse-status.js
            cat >"$jxa_file" <<'JXA'
ObjC.import('Foundation');
function run(argv) {
  const text = $.NSString.stringWithContentsOfFileEncodingError(argv[0], $.NSUTF8StringEncoding, null).js;
  const status = JSON.parse(text);
  const peers = Object.values(status.Peer || {});
  const anchors = peers.filter(p => p.Online === true && (p.Tags || []).includes('tag:secrets-sync-anchor'));
  if (anchors.length !== 1) throw new Error('anchor_count');
  const device = String((status.Self || {}).ID || '');
  const host = String(anchors[0].DNSName || (anchors[0].TailscaleIPs || [''])[0]).replace(/\.$/, '');
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(device)) throw new Error('device_id');
  if (!host || /[\/\\\t\r\n]/.test(host)) throw new Error('anchor_host');
  return device + '\n' + host;
}
JXA
            osascript -l JavaScript "$jxa_file" "$status_file" 2>/dev/null
            ;;
    esac
}

parsed=$(parse_status) || die "expected exactly one online tag:secrets-sync-anchor and a stable local device ID"
device_id=$(printf '%s\n' "$parsed" | sed -n '1p')
anchor_host=$(printf '%s\n' "$parsed" | sed -n '2p')
[ -n "$device_id" ] && [ -n "$anchor_host" ] || die "Tailnet discovery returned incomplete state"
case "$device_id" in
    *[!ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._:-]*) die "stable Tailnet device ID is invalid" ;;
esac
[ "${#device_id}" -ge 8 ] && [ "${#device_id}" -le 128 ] || die "stable Tailnet device ID is invalid"
case "$anchor_host" in
    *[!ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._:-]*) die "Tailnet anchor address is invalid" ;;
esac
case "$anchor_host" in
    *:*) anchor_authority=[$anchor_host] ;;
    *) anchor_authority=$anchor_host ;;
esac
base_url=https://$anchor_authority

http_get() {
    url=$1
    output=$2
    code=$(curl --silent --show-error --max-redirs 0 --proto '=https' \
        --header "X-Secrets-Sync-Device-ID: $device_id" \
        --output "$output" --write-out '%{http_code}' "$url") || die "anchor request failed"
    [ "$code" = 200 ] || die "anchor denied or failed the request (HTTP $code)"
}

discovery=$temp_root/discovery.json
http_get "$base_url/.well-known/secrets-sync" "$discovery"

parse_discovery() {
    case "$parser" in
        python3)
            python3 - "$discovery" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as source:
    value = json.load(source)
if value != {"version": 1, "snapshot": "/v1/bootstrap.tar.gz", "enroll": "/v1/enroll"}:
    raise SystemExit(1)
PY
            ;;
        jq)
            jq -e '. == {version:1,snapshot:"/v1/bootstrap.tar.gz",enroll:"/v1/enroll"}' "$discovery" >/dev/null
            ;;
        jxa)
            jxa_file=$temp_root/parse-discovery.js
            cat >"$jxa_file" <<'JXA'
ObjC.import('Foundation');
function run(argv) {
  const text = $.NSString.stringWithContentsOfFileEncodingError(argv[0], $.NSUTF8StringEncoding, null).js;
  const value = JSON.parse(text);
  if (value.version !== 1 || value.snapshot !== '/v1/bootstrap.tar.gz' || value.enroll !== '/v1/enroll' || Object.keys(value).length !== 3) throw new Error('contract');
}
JXA
            osascript -l JavaScript "$jxa_file" "$discovery" >/dev/null 2>&1
            ;;
    esac
}
parse_discovery || die "anchor discovery contract is invalid"

validate_action_response() {
    response_file=$1
    expected=$2
    case "$parser" in
        python3)
            python3 - "$response_file" "$expected" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as source:
    value = json.load(source)
expected = sys.argv[2]
if set(value) != {expected, "changed"} or value.get(expected) is not True or not isinstance(value.get("changed"), bool):
    raise SystemExit(1)
PY
            ;;
        jq)
            jq -e --arg expected "$expected" \
                'keys == (["changed", $expected] | sort) and .[$expected] == true and (.changed | type) == "boolean"' \
                "$response_file" >/dev/null
            ;;
        jxa)
            jxa_file=$temp_root/parse-action.js
            cat >"$jxa_file" <<'JXA'
ObjC.import('Foundation');
function run(argv) {
  const text = $.NSString.stringWithContentsOfFileEncodingError(argv[0], $.NSUTF8StringEncoding, null).js;
  const value = JSON.parse(text), expected = argv[1], keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== 'changed' || keys[1] !== expected || value[expected] !== true || typeof value.changed !== 'boolean') throw new Error('contract');
}
JXA
            osascript -l JavaScript "$jxa_file" "$response_file" "$expected" >/dev/null 2>&1
            ;;
    esac
}

post_public_key() {
    public_key=$1
    body=$temp_root/enroll.json
    response=$temp_root/enroll-response.json
    printf '{"public_key":"%s"}' "$public_key" >"$body"
    code=$(curl --silent --show-error --max-redirs 0 --proto '=https' \
        --header "X-Secrets-Sync-Device-ID: $device_id" \
        --header 'Content-Type: application/json' \
        --data-binary "@$body" --output "$response" --write-out '%{http_code}' \
        "$base_url/v1/enroll") || die "key enrollment request failed"
    [ "$code" = 200 ] || die "key enrollment was denied or failed (HTTP $code)"
    validate_action_response "$response" enrolled || die "key enrollment response contract is invalid"
}

public_from_key() {
    private_key=$1
    value=$(ssh-keygen -y -f "$private_key" 2>/dev/null) || die "local device key is invalid"
    set -- $value
    [ "$#" = 2 ] && [ "$1" = ssh-ed25519 ] || die "local device key is not Ed25519"
    printf '%s %s\n' "$1" "$2"
}

enroll_key() {
    [ ! -L "$ssh_dir" ] || die ".ssh must not be a symbolic link"
    [ ! -e "$ssh_dir" ] || [ -d "$ssh_dir" ] || die ".ssh must be a directory"
    mkdir -p "$ssh_dir"
    chmod 700 "$ssh_dir"
    if [ -L "$key_path" ] || [ -L "$key_path.pub" ]; then
        die "device key paths must not be symlinks"
    fi
    if [ ! -e "$key_path" ]; then
        [ ! -e "$key_path.pub" ] || die "an orphaned public device key already exists"
        ssh-keygen -q -t ed25519 -N '' -C '' -f "$key_path" >/dev/null || die "cannot generate a local device key"
    fi
    [ -f "$key_path" ] || die "device key is not a regular file"
    chmod 600 "$key_path"
    public_key=$(public_from_key "$key_path")
    post_public_key "$public_key"
}

rotate_key() {
    [ ! -L "$ssh_dir" ] || die ".ssh must not be a symbolic link"
    [ ! -e "$ssh_dir" ] || [ -d "$ssh_dir" ] || die ".ssh must be a directory"
    mkdir -p "$ssh_dir"
    chmod 700 "$ssh_dir"
    if [ -L "$key_path" ] || [ -L "$key_path.pub" ]; then
        die "device key paths must not be symlinks"
    fi
    [ ! -e "$key_path" ] || [ -f "$key_path" ] || die "device private key path is not a regular file"
    [ ! -e "$key_path.pub" ] || [ -f "$key_path.pub" ] || die "device public key path is not a regular file"
    next=$ssh_dir/.secrets-sync_ed25519.pending
    if [ -L "$next" ] || [ -L "$next.pub" ]; then
        die "pending device key paths must not be symlinks"
    fi
    if [ ! -e "$next" ]; then
        [ ! -e "$next.pub" ] || die "an orphaned pending public key already exists"
        ssh-keygen -q -t ed25519 -N '' -C '' -f "$next" >/dev/null || die "cannot generate a replacement device key"
    fi
    [ -f "$next" ] || die "pending device key is not a regular file"
    chmod 600 "$next"
    public_key=$(public_from_key "$next")
    post_public_key "$public_key"
    mv -f "$next" "$key_path"
    if [ -f "$next.pub" ] && [ ! -L "$next.pub" ]; then
        mv -f "$next.pub" "$key_path.pub" || true
    fi
    chmod 600 "$key_path"
    [ ! -f "$key_path.pub" ] || chmod 600 "$key_path.pub"
}

revoke_key() {
    response=$temp_root/revoke-response.json
    code=$(curl --silent --show-error --max-redirs 0 --proto '=https' \
        --request DELETE --header "X-Secrets-Sync-Device-ID: $device_id" \
        --output "$response" --write-out '%{http_code}' "$base_url/v1/enroll") || die "key revocation request failed"
    [ "$code" = 200 ] || die "key revocation was denied or failed (HTTP $code)"
    validate_action_response "$response" revoked || die "key revocation response contract is invalid"
}

if [ "$action" = enroll ]; then
    enroll_key
    printf 'secrets-sync: device key enrolled\n'
    exit 0
elif [ "$action" = rotate ]; then
    rotate_key
    printf 'secrets-sync: device key rotated\n'
    exit 0
elif [ "$action" = revoke ]; then
    revoke_key
    printf 'secrets-sync: device key revoked\n'
    exit 0
fi

expected_pointer=$temp_root/expected-pointer
expected_install_marker=$temp_root/expected-install-marker
expected_pending_marker=$temp_root/expected-pending-marker
printf '%s\n' '# Machine-local agent context' '' '- Private bootstrap source: `~/.agents/bootstrap`' >"$expected_pointer"
printf 'version=1\n' >"$expected_install_marker"
printf 'pending=1\n' >"$expected_pending_marker"

create_pointer() {
    [ ! -L "$doc_dir" ] || die ".agents/doc must not be a symbolic link"
    [ ! -e "$doc_dir" ] || [ -d "$doc_dir" ] || die ".agents/doc must be a directory"
    mkdir -p "$doc_dir"
    chmod 700 "$doc_dir"
    pointer_temp=$(mktemp "$doc_dir/.AGENTS.local.md.XXXXXX") || die "cannot stage the local pointer"
    printf '%s\n' '# Machine-local agent context' '' '- Private bootstrap source: `~/.agents/bootstrap`' >"$pointer_temp"
    chmod 600 "$pointer_temp"
    if ! ln "$pointer_temp" "$pointer" 2>/dev/null; then
        rm -f -- "$pointer_temp"
        die "AGENTS.local.md appeared during installation; nothing was overwritten"
    fi
    rm -f -- "$pointer_temp"
}

if [ -e "$install_dir" ] || [ -L "$install_dir" ]; then
    [ -d "$install_dir" ] && [ ! -L "$install_dir" ] || die "bootstrap destination is not a real directory"
    install_marker=$install_dir/.secrets-sync-install
    pending_marker=$install_dir/.secrets-sync-enrollment-pending
    [ -f "$install_marker" ] && [ ! -L "$install_marker" ] && cmp -s "$install_marker" "$expected_install_marker" || die "existing bootstrap destination is not a resumable install"
    [ -f "$pending_marker" ] && [ ! -L "$pending_marker" ] && cmp -s "$pending_marker" "$expected_pending_marker" || die "existing bootstrap destination is not pending enrollment"
    if [ -e "$pointer" ] || [ -L "$pointer" ]; then
        [ -f "$pointer" ] && [ ! -L "$pointer" ] && cmp -s "$pointer" "$expected_pointer" || die "existing AGENTS.local.md is not the bootstrap pointer; nothing was overwritten"
    else
        create_pointer
    fi
    enroll_key
    rm -f -- "$pending_marker"
    printf 'secrets-sync: bootstrap enrollment resumed\n'
    exit 0
fi
[ ! -e "$pointer" ] && [ ! -L "$pointer" ] || die "AGENTS.local.md already exists; nothing was overwritten"

snapshot=$temp_root/bootstrap.tar.gz
http_get "$base_url/v1/bootstrap.tar.gz" "$snapshot"
[ -s "$snapshot" ] || die "bootstrap snapshot is empty"
[ "$(wc -c <"$snapshot" | tr -d ' ')" -le 16777216 ] || die "bootstrap snapshot is too large"
names=$temp_root/archive-names
verbose=$temp_root/archive-verbose
tar -tzf "$snapshot" >"$names" 2>/dev/null || die "bootstrap snapshot is not a gzip tar archive"
tar -tvzf "$snapshot" >"$verbose" 2>/dev/null || die "bootstrap snapshot metadata is invalid"
[ -s "$names" ] || die "bootstrap snapshot is empty"
while IFS= read -r name; do
    [ -n "$name" ] || die "bootstrap snapshot contains an empty path"
    case "$name" in
        /*|*\\*|*:*|../*|*/../*|*/..|..) die "bootstrap snapshot contains an unsafe path" ;;
    esac
done <"$names"
while IFS= read -r entry; do
    kind=$(printf '%s' "$entry" | cut -c1)
    case "$kind" in
        -|d) ;;
        *) die "bootstrap snapshot contains a link or special file" ;;
    esac
done <"$verbose"

stage=$temp_root/content
mkdir "$stage"
tar -xzf "$snapshot" -C "$stage" --no-same-owner --no-same-permissions 2>/dev/null || die "cannot extract bootstrap snapshot"
if find "$stage" -type l -print -quit | grep -q .; then
    die "bootstrap snapshot extracted a symbolic link"
fi
find "$stage" -type d -exec chmod 700 {} +
find "$stage" -type f -exec chmod 600 {} +
find "$stage" -type f \( -name '*.sh' -o -name '*.py' \) -exec chmod 700 {} +
printf 'version=1\n' >"$stage/.secrets-sync-install"
chmod 600 "$stage/.secrets-sync-install"
printf 'pending=1\n' >"$stage/.secrets-sync-enrollment-pending"
chmod 600 "$stage/.secrets-sync-enrollment-pending"

mv "$stage" "$install_dir" || die "cannot install bootstrap snapshot"
create_pointer
enroll_key
rm -f -- "$install_dir/.secrets-sync-enrollment-pending"
printf 'secrets-sync: bootstrap restored and device key enrolled\n'
