#!/usr/bin/env bash
set -euo pipefail

required=(RUNNER_SCOPE_URL RUNNER_NAME RUNNER_LABELS STORAGE_ROOT MACHINE_NAME MACHINE_CPUS
  MACHINE_MEMORY MACHINE_DISK DATA_IMAGE_GB MAX_RUNNERS CACHE_MAX_GB CACHE_MIN_FREE_GB)
for name in "${required[@]}"; do
  [[ -n ${!name:-} ]] || { printf 'missing environment: %s\n' "$name" >&2; exit 2; }
done
[[ $STORAGE_ROOT == /Volumes/* ]] || { printf 'storage must be under /Volumes\n' >&2; exit 2; }
[[ $STORAGE_ROOT != *[$'\r\n\t\\']* ]] || { printf 'unsafe storage path\n' >&2; exit 2; }
[[ $STORAGE_ROOT =~ ^/Volumes/[^/]+/.+ && $STORAGE_ROOT != */../* \
  && $STORAGE_ROOT != */.. && $STORAGE_ROOT != */./* && $STORAGE_ROOT != */. ]] \
  || { printf 'storage path must stay below one external volume\n' >&2; exit 2; }
[[ $RUNNER_SCOPE_URL =~ ^https://github\.com/[A-Za-z0-9][A-Za-z0-9-]{0,38}(/[A-Za-z0-9._-]{1,100})?$ ]] \
  || { printf 'invalid runner scope URL\n' >&2; exit 2; }
[[ $RUNNER_NAME =~ ^[A-Za-z0-9._-]{1,64}$ && $MACHINE_NAME =~ ^[A-Za-z0-9._-]{1,63}$ ]] \
  || { printf 'unsafe runner or machine name\n' >&2; exit 2; }
[[ $RUNNER_LABELS =~ ^[A-Za-z0-9._-]+(,[A-Za-z0-9._-]+)*$ ]] \
  || { printf 'unsafe runner labels\n' >&2; exit 2; }
[[ ${RUNNER_GROUP:-} =~ ^[A-Za-z0-9._-]{0,64}$ ]] \
  || { printf 'unsafe runner group\n' >&2; exit 2; }
[[ $MACHINE_CPUS =~ ^[1-9][0-9]*$ && $MACHINE_MEMORY =~ ^[1-9][0-9]*[MG]$ \
  && $MACHINE_DISK =~ ^[1-9][0-9]*[MG]$ ]] || { printf 'invalid machine limits\n' >&2; exit 2; }
[[ $DATA_IMAGE_GB =~ ^[1-9][0-9]*$ && $MAX_RUNNERS =~ ^[1-3]$ \
  && $CACHE_MAX_GB =~ ^[1-9][0-9]*$ && $CACHE_MIN_FREE_GB =~ ^[1-9][0-9]*$ ]] \
  || { printf 'invalid runner limits\n' >&2; exit 2; }
IFS= read -r RUNNER_TOKEN
[[ -n $RUNNER_TOKEN ]] || { printf 'empty runner token\n' >&2; exit 2; }
trap 'RUNNER_TOKEN=' EXIT

find_orb() {
  if command -v orb >/dev/null 2>&1; then command -v orb; return; fi
  local candidate
  for candidate in \
    /Applications/OrbStack.app/Contents/MacOS/bin/orb \
    "$HOME/Applications/OrbStack.app/Contents/MacOS/bin/orb" \
    /Volumes/*/Applications/OrbStack.app/Contents/MacOS/bin/orb; do
    [[ -x $candidate ]] && { printf '%s\n' "$candidate"; return; }
  done
  return 1
}

orb_bin=$(find_orb) || { printf 'OrbStack CLI not found\n' >&2; exit 1; }
mkdir -p "$STORAGE_ROOT/config"
rm -f "$STORAGE_ROOT/secrets/registration-token"
volume_root=$(df -P "$STORAGE_ROOT" | awk 'NR==2 {print $6}')
[[ $volume_root == /Volumes/* ]] || { printf 'storage resolved off external volume: %s\n' "$volume_root" >&2; exit 1; }

# OrbStack's global memory_mib caps every machine on the host, so a per-machine --memory above it
# is silently downgraded: the machine boots smaller than asked and nothing reports it. Refuse
# instead of lying. Not raised automatically -- applying it needs an `orb stop`, which kills any
# running job, and the right ceiling depends on how much the host OS still needs.
requested_mib=${MACHINE_MEMORY%[MG]}
[[ ${MACHINE_MEMORY: -1} == G ]] && requested_mib=$((requested_mib * 1024))
global_mib=$("$orb_bin" config get memory_mib 2>/dev/null || printf '0')
if [[ $global_mib =~ ^[0-9]+$ ]] && ((global_mib > 0 && global_mib < requested_mib)); then
  printf 'OrbStack global memory_mib is %s, below this machine memory %s (%s MiB).\n' \
    "$global_mib" "$MACHINE_MEMORY" "$requested_mib" >&2
  printf 'The machine would run at %s MiB and never say so. Raise the cap first:\n' "$global_mib" >&2
  printf '  orb config set memory_mib %s && orb stop && orb start\n' "$requested_mib" >&2
  printf 'Leave the host OS headroom, and drain runners first -- the restart kills running jobs.\n' >&2
  exit 1
fi

if ! "$orb_bin" list | awk '{print $1}' | grep -Fxq "$MACHINE_NAME"; then
  "$orb_bin" create --arch arm64 --cpus "$MACHINE_CPUS" --memory "$MACHINE_MEMORY" \
    --disk "$MACHINE_DISK" --user runner ubuntu:24.04 "$MACHINE_NAME"
fi
for _ in {1..90}; do
  if "$orb_bin" -m "$MACHINE_NAME" -u root true >/dev/null 2>&1; then break; fi
  sleep 2
done
"$orb_bin" -m "$MACHINE_NAME" -u root true >/dev/null

bundle_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
machine_bundle="/mnt/mac$bundle_dir"
machine_storage="/mnt/mac$STORAGE_ROOT"
printf '%s\n' "$RUNNER_TOKEN" | "$orb_bin" -m "$MACHINE_NAME" -u root env \
  RUNNER_SCOPE_URL="$RUNNER_SCOPE_URL" \
  RUNNER_NAME="$RUNNER_NAME" \
  RUNNER_LABELS="$RUNNER_LABELS" \
  RUNNER_GROUP="${RUNNER_GROUP:-}" \
  STORAGE_ROOT="$machine_storage" \
  BUNDLE_ROOT="$machine_bundle" \
  DATA_IMAGE_GB="$DATA_IMAGE_GB" \
  MAX_RUNNERS="$MAX_RUNNERS" \
  CACHE_MAX_GB="$CACHE_MAX_GB" \
  CACHE_MIN_FREE_GB="$CACHE_MIN_FREE_GB" \
  bash "$machine_bundle/setup-machine.sh"
RUNNER_TOKEN=''
