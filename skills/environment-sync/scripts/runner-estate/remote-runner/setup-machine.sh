#!/usr/bin/env bash
set -euo pipefail

required=(RUNNER_SCOPE_URL RUNNER_NAME RUNNER_LABELS STORAGE_ROOT BUNDLE_ROOT DATA_IMAGE_GB
  MAX_RUNNERS CACHE_MAX_GB CACHE_MIN_FREE_GB)
for name in "${required[@]}"; do
  [[ -n ${!name:-} ]] || { printf 'missing environment: %s\n' "$name" >&2; exit 2; }
done
[[ $STORAGE_ROOT == /mnt/mac/Volumes/* ]] || { printf 'external storage mount missing\n' >&2; exit 2; }
[[ $STORAGE_ROOT != *[$'\r\n\t\\']* && $BUNDLE_ROOT != *[$'\r\n\t\\']* ]] \
  || { printf 'unsafe mounted path\n' >&2; exit 2; }
[[ $STORAGE_ROOT =~ ^/mnt/mac/Volumes/[^/]+/.+ && $BUNDLE_ROOT =~ ^/mnt/mac/Volumes/[^/]+/.+ \
  && $STORAGE_ROOT != */../* && $STORAGE_ROOT != */.. \
  && $BUNDLE_ROOT != */../* && $BUNDLE_ROOT != */.. ]] \
  || { printf 'mounted paths must stay below one external volume\n' >&2; exit 2; }
[[ $RUNNER_SCOPE_URL =~ ^https://github\.com/[A-Za-z0-9][A-Za-z0-9-]{0,38}(/[A-Za-z0-9._-]{1,100})?$ ]] \
  || { printf 'invalid runner scope URL\n' >&2; exit 2; }
[[ $RUNNER_NAME =~ ^[A-Za-z0-9._-]{1,64}$ ]] || { printf 'unsafe runner name\n' >&2; exit 2; }
[[ $RUNNER_LABELS =~ ^[A-Za-z0-9._-]+(,[A-Za-z0-9._-]+)*$ ]] \
  || { printf 'unsafe runner labels\n' >&2; exit 2; }
[[ ${RUNNER_GROUP:-} =~ ^[A-Za-z0-9._-]{0,64}$ ]] \
  || { printf 'unsafe runner group\n' >&2; exit 2; }
[[ $DATA_IMAGE_GB =~ ^[1-9][0-9]*$ && $MAX_RUNNERS =~ ^[1-3]$ \
  && $CACHE_MAX_GB =~ ^[1-9][0-9]*$ && $CACHE_MIN_FREE_GB =~ ^[1-9][0-9]*$ ]] \
  || { printf 'invalid runner limits\n' >&2; exit 2; }
IFS= read -r RUNNER_TOKEN
[[ -n $RUNNER_TOKEN ]] || { printf 'runner registration token missing\n' >&2; exit 1; }
trap 'RUNNER_TOKEN=' EXIT

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y --no-install-recommends \
  ca-certificates curl docker.io git git-lfs jq python3 sudo unzip xz-utils zip

id runner >/dev/null 2>&1 || useradd -m -s /bin/bash runner
data_image="$STORAGE_ROOT/runner-data.ext4"
data_root=/srv/runner-data
mkdir -p "$data_root"
if [[ ! -e $data_image ]]; then
  truncate -s "${DATA_IMAGE_GB}G" "$data_image"
  mkfs.ext4 -F -L runner-data "$data_image" >/dev/null
fi
chmod 600 "$data_image"
blkid "$data_image" | grep -q 'TYPE="ext4"' || { printf 'runner data image is not ext4\n' >&2; exit 1; }
if ! mountpoint -q "$data_root"; then
  mount -o loop,discard "$data_image" "$data_root"
fi
mounted_source=$(findmnt -rn -t ext4 -o SOURCE --target "$data_root" | tail -n 1)
[[ -n $mounted_source ]] || { printf 'runner data root is not an ext4 mount\n' >&2; exit 1; }
mounted_backing=$(losetup --noheadings --raw --output BACK-FILE "$mounted_source")
[[ $(readlink -f "$mounted_backing") == $(readlink -f "$data_image") ]] \
  || { printf 'runner data root is mounted from an unexpected image\n' >&2; exit 1; }

fstab_image=${data_image// /\\040}
fstab_line="$fstab_image $data_root ext4 loop,discard,nofail,x-systemd.automount,x-systemd.device-timeout=30 0 2"
fstab_tmp=$(mktemp)
awk -v root="$data_root" '$2 != root { print }' /etc/fstab > "$fstab_tmp"
printf '%s\n' "$fstab_line" >> "$fstab_tmp"
install -m 644 "$fstab_tmp" /etc/fstab
rm -f "$fstab_tmp"
mount -o remount,discard "$data_root"
mkdir -p "$data_root"/{work,cache,home,tmp,docker}
chown -R runner:runner "$data_root"/{work,cache,home,tmp}

install -d -m 755 /etc/docker
printf '{"data-root":"%s"}\n' "$data_root/docker" >/etc/docker/daemon.json
systemctl enable docker
systemctl restart docker
usermod -aG docker runner

install -d -m 755 /opt/runner-hooks
install -m 755 "$BUNDLE_ROOT/hooks/prune-cache.py" /opt/runner-hooks/prune-cache.py
install -m 755 "$BUNDLE_ROOT/hooks/pre-job.sh" /opt/runner-hooks/pre-job.sh
install -m 755 "$BUNDLE_ROOT/hooks/post-job.sh" /opt/runner-hooks/post-job.sh

runner_dir="/opt/actions-runner-$RUNNER_NAME"
existing_count=$(find /opt -maxdepth 2 -name .runner -path '/opt/actions-runner-*' | wc -l)
if [[ ! -f $runner_dir/.runner && $existing_count -ge $MAX_RUNNERS ]]; then
  printf 'managed runner cap reached: %s/%s\n' "$existing_count" "$MAX_RUNNERS" >&2
  exit 1
fi

if [[ ! -x $runner_dir/config.sh ]]; then
  release_json=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest)
  read -r runner_url runner_sha <<EOF
$(python3 -c '
import json, sys
d=json.load(sys.stdin)
a=next(x for x in d["assets"] if "linux-arm64-" in x["name"] and x["name"].endswith(".tar.gz"))
digest=a.get("digest", "")
if not digest.startswith("sha256:"): raise SystemExit("release asset has no sha256 digest")
print(a["browser_download_url"], digest.removeprefix("sha256:"))
' <<<"$release_json")
EOF
  mkdir -p "$runner_dir"
  curl -fsSL --retry 3 -o "$runner_dir/runner.tar.gz" "$runner_url"
  printf '%s  %s\n' "$runner_sha" "$runner_dir/runner.tar.gz" | sha256sum -c -
  tar xzf "$runner_dir/runner.tar.gz" -C "$runner_dir"
  rm "$runner_dir/runner.tar.gz"
  (cd "$runner_dir" && ./bin/installdependencies.sh)
  chown -R runner:runner "$runner_dir"
fi

mkdir -p "$data_root/work/$RUNNER_NAME"
chown runner:runner "$data_root/work/$RUNNER_NAME"
if [[ ! -e $runner_dir/_work ]]; then
  ln -s "$data_root/work/$RUNNER_NAME" "$runner_dir/_work"
  chown -h runner:runner "$runner_dir/_work"
fi

runner_cache="$data_root/cache/$RUNNER_NAME"
runner_home="$data_root/home/$RUNNER_NAME"
runner_tmp="$data_root/tmp/$RUNNER_NAME"
runner_cache_max_gb=$((CACHE_MAX_GB / MAX_RUNNERS))
((runner_cache_max_gb > 0)) || { printf 'cache maximum is too small for runner cap\n' >&2; exit 2; }
mkdir -p "$runner_cache"
mkdir -p "$runner_home"
mkdir -p "$runner_tmp"
for cache_name in tool xdg npm yarn corepack gradle pub ccache sccache; do
  legacy_cache="$data_root/cache/$cache_name"
  if [[ -e $legacy_cache ]]; then
    [[ ! -e $runner_cache/$cache_name ]] \
      || { printf 'legacy and runner cache paths both exist: %s\n' "$cache_name" >&2; exit 1; }
    mv "$legacy_cache" "$runner_cache/$cache_name"
  fi
done
chown -R runner:runner "$runner_cache"
chown -R runner:runner "$runner_home"
chown -R runner:runner "$runner_tmp"

if [[ ! -f $runner_dir/.runner ]]; then
  config_args=(--unattended --replace --url "$RUNNER_SCOPE_URL" --name "$RUNNER_NAME" \
    --labels "$RUNNER_LABELS" --work _work)
  [[ -z ${RUNNER_GROUP:-} ]] || config_args+=(--runnergroup "$RUNNER_GROUP")
  export ACTIONS_RUNNER_INPUT_TOKEN=$RUNNER_TOKEN
  (cd "$runner_dir" && sudo --preserve-env=ACTIONS_RUNNER_INPUT_TOKEN -u runner \
    ./config.sh "${config_args[@]}")
  unset ACTIONS_RUNNER_INPUT_TOKEN
fi
RUNNER_TOKEN=''

cat >"$runner_dir/.env" <<EOF
LANG=C.UTF-8
HOME=$runner_home
TMPDIR=$runner_tmp
TMP=$runner_tmp
TEMP=$runner_tmp
RUNNER_CACHE_ROOT=$runner_cache
RUNNER_TOOL_CACHE=$runner_cache/tool
XDG_CACHE_HOME=$runner_cache/xdg
npm_config_cache=$runner_cache/npm
YARN_CACHE_FOLDER=$runner_cache/yarn
COREPACK_HOME=$runner_cache/corepack
GRADLE_USER_HOME=$runner_cache/gradle
PUB_CACHE=$runner_cache/pub
CCACHE_DIR=$runner_cache/ccache
SCCACHE_DIR=$runner_cache/sccache
CACHE_MAX_GB=$runner_cache_max_gb
CACHE_MIN_FREE_GB=$CACHE_MIN_FREE_GB
CACHE_BACKING_ROOT=$STORAGE_ROOT
CACHE_BACKING_IMAGE=$data_image
ACTIONS_RUNNER_HOOK_JOB_STARTED=/opt/runner-hooks/pre-job.sh
ACTIONS_RUNNER_HOOK_JOB_COMPLETED=/opt/runner-hooks/post-job.sh
EOF
chown runner:runner "$runner_dir/.env"

if [[ ! -f $runner_dir/.service ]]; then
  (cd "$runner_dir" && ./svc.sh install runner)
else
  (cd "$runner_dir" && ./svc.sh stop) || true
fi
(cd "$runner_dir" && ./svc.sh start)
(cd "$runner_dir" && ./svc.sh status)
