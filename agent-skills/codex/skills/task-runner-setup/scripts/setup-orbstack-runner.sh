#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: setup-orbstack-runner.sh --ssh-host USER@HOST --scope org:ORG|repo:OWNER/REPO
       --storage-root /Volumes/VOLUME/PATH --runner-name NAME [options]

Options:
  --machine-name NAME       OrbStack machine (default: github-runner)
  --machine-cpus N          Machine CPU limit (default: 8)
  --machine-memory SIZE     Machine memory limit (default: 10G)
  --machine-disk SIZE       Sparse OS disk limit (default: 64G)
  --data-image-gb N         External sparse ext4 size (default: 700)
  --labels CSV              Extra labels (default: orb,linux-arm64,heavy)
  --runner-group NAME       Required runner group for org scope
  --allow-org-wide-group    Accept a runner group whose visibility is not
                            'selected'. Every private org repo can then run code
                            on this host. Required on GitHub Free, where
                            selected-visibility groups leave private-repo jobs queued.
  --max-runners N           Managed runner hard cap, 1-3 (default: 3)
  --cache-max-gb N          Prune when cache exceeds N GiB (default: 400)
  --cache-min-free-gb N     Refuse new jobs below N GiB free (default: 100)
  --dry-run                 Validate and print the mutation plan only
EOF
}

die() { printf 'error: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing command: $1"; }
quote() { printf '%q' "$1"; }
gh_api() { gh api --hostname github.com "$@"; }
ssh_options=(-o BatchMode=yes -o ConnectTimeout=10 -o PreferredAuthentications=publickey
  -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no
  -o GSSAPIAuthentication=no -o HostbasedAuthentication=no)

ssh_host=''
scope=''
storage_root=''
runner_name=''
machine_name=github-runner
machine_cpus=8
machine_memory=10G
machine_disk=64G
data_image_gb=700
labels='orb,linux-arm64,heavy'
runner_group=''
max_runners=3
allow_org_wide_group=false
cache_max_gb=400
cache_min_free_gb=100
dry_run=false

while (($#)); do
  case "$1" in
    --ssh-host) ssh_host=${2:?}; shift 2 ;;
    --scope) scope=${2:?}; shift 2 ;;
    --storage-root) storage_root=${2:?}; shift 2 ;;
    --runner-name) runner_name=${2:?}; shift 2 ;;
    --machine-name) machine_name=${2:?}; shift 2 ;;
    --machine-cpus) machine_cpus=${2:?}; shift 2 ;;
    --machine-memory) machine_memory=${2:?}; shift 2 ;;
    --machine-disk) machine_disk=${2:?}; shift 2 ;;
    --data-image-gb) data_image_gb=${2:?}; shift 2 ;;
    --labels) labels=${2:?}; shift 2 ;;
    --runner-group) runner_group=${2:?}; shift 2 ;;
    --max-runners) max_runners=${2:?}; shift 2 ;;
    --allow-org-wide-group) allow_org_wide_group=true; shift ;;
    --cache-max-gb) cache_max_gb=${2:?}; shift 2 ;;
    --cache-min-free-gb) cache_min_free_gb=${2:?}; shift 2 ;;
    --dry-run) dry_run=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

[[ -n $ssh_host && -n $scope && -n $storage_root && -n $runner_name ]] || {
  usage >&2
  exit 2
}
[[ $ssh_host != -* && $ssh_host != *[[:space:]]* ]] \
  || die 'SSH host must be one host or SSH-config alias, without options'
[[ $storage_root != *[$'\r\n\t\\']* ]] || die 'storage root contains unsafe characters'
[[ $storage_root =~ ^/Volumes/[^/]+/.+ && $storage_root != */../* \
  && $storage_root != */.. && $storage_root != */./* && $storage_root != */. ]] \
  || die 'storage root must be a non-traversing path below an external volume'
[[ $runner_name =~ ^[A-Za-z0-9._-]{1,64}$ ]] || die 'runner name has unsafe characters'
[[ $machine_name =~ ^[A-Za-z0-9._-]{1,63}$ ]] || die 'machine name has unsafe characters'
[[ $machine_memory =~ ^[1-9][0-9]*[MG]$ ]] || die 'machine memory must look like 10G or 512M'
[[ $machine_disk =~ ^[1-9][0-9]*[MG]$ ]] || die 'machine disk must look like 64G or 512M'
[[ $labels =~ ^[A-Za-z0-9._-]+(,[A-Za-z0-9._-]+)*$ ]] || die 'labels contain unsafe characters'
[[ -z $runner_group || $runner_group =~ ^[A-Za-z0-9._-]{1,64}$ ]] \
  || die 'runner group contains unsafe characters'
[[ $max_runners =~ ^[1-3]$ ]] || die '--max-runners must be 1, 2, or 3'
for value in "$machine_cpus" "$data_image_gb" "$cache_max_gb" "$cache_min_free_gb"; do
  [[ $value =~ ^[0-9]+$ && $value -gt 0 ]] || die "invalid numeric value: $value"
done
((cache_max_gb + cache_min_free_gb < data_image_gb)) \
  || die 'cache max plus minimum free space must be smaller than the data image'
[[ $storage_root == /Volumes/* ]] || die 'storage root must be on an external /Volumes mount'

if [[ $scope =~ ^org:([A-Za-z0-9][A-Za-z0-9-]{0,38})$ ]]; then
    owner=${BASH_REMATCH[1]}
    [[ -n $runner_group ]] || die '--runner-group is required for org scope'
    scope_url="https://github.com/$owner"
    token_endpoint="orgs/$owner/actions/runners/registration-token"
    runners_endpoint="orgs/$owner/actions/runners"
elif [[ $scope =~ ^repo:([A-Za-z0-9][A-Za-z0-9-]{0,38})/([A-Za-z0-9._-]{1,100})$ ]]; then
    [[ -z $runner_group ]] || die '--runner-group is valid only for org scope'
    owner_repo=${BASH_REMATCH[1]}/${BASH_REMATCH[2]}
    scope_url="https://github.com/$owner_repo"
    token_endpoint="repos/$owner_repo/actions/runners/registration-token"
    runners_endpoint="repos/$owner_repo/actions/runners"
    repo_visibility=$(gh_api "repos/$owner_repo" --jq .visibility)
    [[ $repo_visibility == private ]] || die 'repo-scoped self-hosted runners require a private repository'
else
  die 'scope must be org:ORG or repo:OWNER/REPO'
fi

need gh
need ssh
need tar
script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
remote_bundle="$storage_root/config/bootstrap"
volume_name=${storage_root#/Volumes/}
volume_name=${volume_name%%/*}
volume_root="/Volumes/$volume_name"

printf 'Runner plan\n  host: %s\n  scope: %s\n  machine: %s (%s CPU, %s RAM)\n  runner: %s (max %s)\n  storage: %s (%s GiB sparse ext4)\n  cache: max %s GiB, min free %s GiB\n' \
  "$ssh_host" "$scope_url" "$machine_name" "$machine_cpus" "$machine_memory" \
  "$runner_name" "$max_runners" "$storage_root" "$data_image_gb" \
  "$cache_max_gb" "$cache_min_free_gb"

ssh "${ssh_options[@]}" -- "$ssh_host" "test -d $(quote "$volume_root") && test -w $(quote "$volume_root")" \
  || die 'external volume is absent or not writable'

gh auth status -h github.com >/dev/null
if [[ -n $runner_group ]]; then
  group_data=$(gh_api "orgs/$owner/actions/runner-groups" --paginate \
    --jq ".runner_groups[] | select(.name == \"$runner_group\") | [.id, .visibility, .allows_public_repositories] | @tsv")
  [[ -n $group_data ]] || die "runner group does not exist: $runner_group"
  IFS=$'\t' read -r runner_group_id group_visibility group_allows_public <<< "$group_data"
  # The threat a self-hosted runner must be walled off from is a public repository: anyone can
  # open a fork PR, and the workflow it carries would execute on this machine. GitHub enforces
  # allows_public_repositories itself, so it stays a hard requirement and keeps holding even if
  # someone makes an org repo public later.
  [[ $group_allows_public == false ]] \
    || die 'org runner group must disallow public repositories: a fork PR would run on the runner'
  # selected-repository visibility is least-privilege *between private repos* — a separate, weaker
  # concern than the public-repo one above, and one GitHub Free cannot honor: on Free, a private
  # repo pointed at a selected-visibility group leaves its jobs queued forever, so `all` is the
  # only setting that runs anything there. `all` is therefore allowed, but never by default: it
  # lets every private repo in the org execute code on this host, and anyone with write access to
  # any of them inherits that. Harmless for a one-person org, not for a large one — so the
  # operator states it rather than a script deciding for their org.
  if [[ $group_visibility != selected ]] && ! $allow_org_wide_group; then
    die "runner group '$runner_group' has $group_visibility visibility: every private org repo could run code on this host. Pass --allow-org-wide-group to accept that, or use a selected-repository group (unavailable on GitHub Free)"
  fi
  if [[ $group_visibility == selected ]]; then
    selected_count=$(gh_api "orgs/$owner/actions/runner-groups/$runner_group_id/repositories" --paginate \
      --jq '[.repositories[]] | length' | awk '{ total += $1 } END { print total + 0 }')
    [[ $selected_count =~ ^[1-9][0-9]*$ ]] || die 'selected-visibility runner group must select at least one repository'
  fi
fi
runner_data=$(gh_api "$runners_endpoint" --paginate \
  --jq ".runners[] | select(.name == \"$runner_name\") | [.id, .busy] | @tsv")
IFS=$'\t' read -r existing_runner_id busy <<< "$runner_data"
[[ $busy != true ]] || die "runner is busy; retry after its current job: $runner_name"
if [[ -n $runner_group && -n $existing_runner_id ]]; then
  in_group=$(gh_api "orgs/$owner/actions/runner-groups/$runner_group_id/runners" --paginate \
    --jq ".runners[] | select(.id == $existing_runner_id) | .id")
  if [[ -z $in_group ]]; then
    if $dry_run; then
      printf 'dry-run: existing runner would move to restricted group %s\n' "$runner_group"
    else
      gh_api --method PUT \
        "orgs/$owner/actions/runner-groups/$runner_group_id/runners/$existing_runner_id" >/dev/null
    fi
  fi
fi
if $dry_run; then exit 0; fi
token=$(gh_api --method POST "$token_endpoint" --jq .token)
[[ -n $token ]] || die 'GitHub returned an empty registration token'
trap 'token=' EXIT

tar -C "$script_dir" -cf - remote-runner | \
  ssh "${ssh_options[@]}" -- "$ssh_host" "mkdir -p $(quote "$remote_bundle") && tar -C $(quote "$remote_bundle") -xf -"

remote_command=$(printf \
  'RUNNER_SCOPE_URL=%q RUNNER_NAME=%q RUNNER_LABELS=%q RUNNER_GROUP=%q STORAGE_ROOT=%q MACHINE_NAME=%q MACHINE_CPUS=%q MACHINE_MEMORY=%q MACHINE_DISK=%q DATA_IMAGE_GB=%q MAX_RUNNERS=%q CACHE_MAX_GB=%q CACHE_MIN_FREE_GB=%q bash %q' \
  "$scope_url" "$runner_name" "$labels" "$runner_group" "$storage_root" "$machine_name" \
  "$machine_cpus" "$machine_memory" "$machine_disk" "$data_image_gb" \
  "$max_runners" "$cache_max_gb" "$cache_min_free_gb" \
  "$remote_bundle/remote-runner/setup-host.sh")
printf '%s\n' "$token" | ssh "${ssh_options[@]}" -- "$ssh_host" "$remote_command"
token=''

for _ in {1..45}; do
  status=$(gh_api "$runners_endpoint" --paginate \
    --jq ".runners[] | select(.name == \"$runner_name\") | .status")
  if [[ $status == online ]]; then
    printf 'runner online: %s\n' "$runner_name"
    exit 0
  fi
  sleep 2
done
die "runner did not become online: $runner_name"
