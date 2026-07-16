#!/usr/bin/env bash
set -Eeuo pipefail

scripts=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/task-runner-setup-test.XXXXXX")
trap 'rm -rf "$tmp_dir"' EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

mkdir -p "$tmp_dir/bin"
cat > "$tmp_dir/bin/ssh" <<'MOCK_SSH'
#!/usr/bin/env bash
exit 0
MOCK_SSH
cat > "$tmp_dir/bin/gh" <<'MOCK_GH'
#!/usr/bin/env bash
if [[ "$*" == *"repos/Example/repo"* ]]; then
  printf '%s\n' "${MOCK_REPO_VISIBILITY:-private}"
fi
exit 0
MOCK_GH
chmod +x "$tmp_dir/bin/ssh" "$tmp_dir/bin/gh"
export PATH="$tmp_dir/bin:$PATH"

orchestrator=$scripts/setup-orbstack-runner.sh
valid=(--ssh-host runner@example --scope repo:Example/repo --storage-root /Volumes/External/Actions \
  --runner-name runner-1 --dry-run)
$orchestrator "${valid[@]}" > "$tmp_dir/valid.out"
grep -q 'Runner plan' "$tmp_dir/valid.out" || fail 'valid dry-run did not print plan'

MOCK_REPO_VISIBILITY=public
export MOCK_REPO_VISIBILITY
if $orchestrator "${valid[@]}" >"$tmp_dir/public.out" 2>&1; then
  fail 'public repository runner scope was accepted'
fi
unset MOCK_REPO_VISIBILITY

if $orchestrator --ssh-host runner@example --scope org:Example \
  --storage-root /Volumes/External/Actions --runner-name runner-1 --dry-run \
  >"$tmp_dir/group.out" 2>&1; then
  fail 'organization scope without restricted runner group was accepted'
fi

if $orchestrator --ssh-host '-oProxyCommand=bad' --scope org:Example \
  --storage-root /Volumes/External/Actions --runner-name runner-1 --dry-run \
  >"$tmp_dir/host.out" 2>&1; then
  fail 'SSH option injection was accepted'
fi

if $orchestrator --ssh-host runner@example --scope org:Example \
  --storage-root /Volumes/External/../escape --runner-name runner-1 --dry-run \
  >"$tmp_dir/path.out" 2>&1; then
  fail 'storage path traversal was accepted'
fi

if $orchestrator --ssh-host runner@example --scope 'org:Example;bad' \
  --storage-root /Volumes/External/Actions --runner-name runner-1 --dry-run \
  >"$tmp_dir/scope.out" 2>&1; then
  fail 'unsafe organization scope was accepted'
fi

common_env=(
  RUNNER_SCOPE_URL=https://github.com/Example
  RUNNER_NAME=runner-1
  RUNNER_LABELS=orb,heavy
  STORAGE_ROOT=/Volumes/External/Actions
  MACHINE_NAME=github-runner
  MACHINE_CPUS=8
  MACHINE_MEMORY=10G
  MACHINE_DISK=64G
  DATA_IMAGE_GB=700
  MAX_RUNNERS=3
  CACHE_MAX_GB=400
  CACHE_MIN_FREE_GB=100
)
if printf 'token\n' | env "${common_env[@]}" MACHINE_NAME='../escape' \
  bash "$scripts/remote-runner/setup-host.sh" >"$tmp_dir/host-script.out" 2>&1; then
  fail 'remote host setup accepted unsafe machine name'
fi

if env RUNNER_SCOPE_URL=https://github.com/Example RUNNER_NAME='../escape' \
  RUNNER_LABELS=orb,heavy STORAGE_ROOT=/mnt/mac/Volumes/External/Actions \
  BUNDLE_ROOT=/mnt/mac/Volumes/External/Actions/config/bootstrap/remote-runner \
  DATA_IMAGE_GB=700 MAX_RUNNERS=3 CACHE_MAX_GB=400 CACHE_MIN_FREE_GB=100 \
  bash "$scripts/remote-runner/setup-machine.sh" >"$tmp_dir/machine-script.out" 2>&1; then
  fail 'machine setup accepted unsafe runner name'
fi

machine_script=$scripts/remote-runner/setup-machine.sh
! grep -Eq -- '--token([[:space:]]|$)' "$machine_script" \
  || fail 'registration token appears in config argv'
grep -q 'ACTIONS_RUNNER_INPUT_TOKEN' "$machine_script" \
  || fail 'registration token is not supplied through protected input environment'
grep -q '^HOME=\$runner_home$' "$machine_script" \
  || fail 'runner HOME is not redirected to external data'
grep -q 'mounted_backing=' "$machine_script" \
  || fail 'mounted ext4 backing image is not verified'

printf 'PASS: task-runner-setup input validation\n'
