#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'USAGE'
Usage:
  task-run-ssh.sh run [options] -- command [arg ...]
  task-run-ssh.sh status [options] task-id
  task-run-ssh.sh logs [--follow] [options] task-id
  task-run-ssh.sh clean [options] task-id

Options:
  --host HOST        SSH config alias or user@host (or TASK_RUN_SSH_HOST)
  --root PATH        Absolute remote external-storage root (or TASK_RUN_SSH_ROOT)
  --repo-key KEY     Stable remote repository key (or TASK_RUN_SSH_REPO_KEY)
  --repo-dir PATH    Local repository for run (default: current directory)
  --commit REV       Committed revision for run (default: HEAD)
  --task-id ID       Explicit collision-checked task ID for run
  --cache-max-gb N   Cache cap in GiB (or TASK_RUN_SSH_CACHE_MAX_GB; default: 200)
  --min-free-gb N    Root free-space floor (or TASK_RUN_SSH_MIN_FREE_GB; default: 50)
  --detach           Return after launching the job
  --keep             Retain the remote worktree and task ref after completion
  --follow           Follow logs until interrupted
USAGE
}

die() {
  printf 'task-run-ssh: %s\n' "$*" >&2
  exit 2
}

quote_remote() {
  local value=${1-}
  value=${value//\'/\'\\\'\'}
  printf "'%s'" "$value"
}

remote_command() {
  local arg command='' quoted
  for arg in "$@"; do
    quoted=$(quote_remote "$arg")
    command+="${command:+ }${quoted}"
  done
  printf '%s' "$command"
}

remote_exec() {
  local command
  command=$(remote_command "$@")
  ssh "${ssh_options[@]}" -- "$host" "$command"
}

remote_bash() {
  local command
  command=$(remote_command bash -s -- "$@")
  ssh "${ssh_options[@]}" -- "$host" "$command"
}

valid_name() {
  [[ $1 =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$ ]]
}

hash_text() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{print substr($1, 1, 12)}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print substr($1, 1, 12)}'
  else
    die 'shasum or sha256sum is required'
  fi
}

default_repo_key() {
  local repo_dir=$1 top name identity digest
  top=$(git -C "$repo_dir" rev-parse --show-toplevel) || die 'not a Git repository'
  name=$(basename "$top")
  identity=$(git -C "$top" remote get-url origin 2>/dev/null || printf '%s' "$top")
  digest=$(printf '%s' "$identity" | hash_text)
  name=${name//[^A-Za-z0-9._-]/-}
  [[ $name =~ ^[A-Za-z0-9] ]] || name=repo-$name
  printf '%s-%s' "${name:-repo}" "$digest"
}

new_task_id() {
  local suffix
  suffix=$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')
  printf '%s-%s-%s-%s' "$(date -u +%Y%m%dT%H%M%SZ)" "$short_commit" "$$" "$suffix"
}

action=${1-}
[[ -n $action ]] || { usage >&2; exit 2; }
shift
if [[ $action == -h || $action == --help || $action == help ]]; then
  usage
  exit 0
fi

host=${TASK_RUN_SSH_HOST:-}
root=${TASK_RUN_SSH_ROOT:-}
repo_key=${TASK_RUN_SSH_REPO_KEY:-}
repo_dir=.
revision=HEAD
task_id=''
cache_max_gb=${TASK_RUN_SSH_CACHE_MAX_GB:-200}
cache_max_set=0
min_free_gb=${TASK_RUN_SSH_MIN_FREE_GB:-50}
min_free_set=0
detach=0
keep=0
follow=0
positionals=()

while (($#)); do
  case $1 in
    --host) (($# >= 2)) || die '--host requires a value'; host=$2; shift 2 ;;
    --root) (($# >= 2)) || die '--root requires a value'; root=$2; shift 2 ;;
    --repo-key) (($# >= 2)) || die '--repo-key requires a value'; repo_key=$2; shift 2 ;;
    --repo-dir) (($# >= 2)) || die '--repo-dir requires a value'; repo_dir=$2; shift 2 ;;
    --commit) (($# >= 2)) || die '--commit requires a value'; revision=$2; shift 2 ;;
    --task-id) (($# >= 2)) || die '--task-id requires a value'; task_id=$2; shift 2 ;;
    --cache-max-gb) (($# >= 2)) || die '--cache-max-gb requires a value'; cache_max_gb=$2; cache_max_set=1; shift 2 ;;
    --min-free-gb) (($# >= 2)) || die '--min-free-gb requires a value'; min_free_gb=$2; min_free_set=1; shift 2 ;;
    --detach) detach=1; shift ;;
    --keep) keep=1; shift ;;
    --follow) follow=1; shift ;;
    --) shift; positionals+=("$@"); break ;;
    -h|--help) usage; exit 0 ;;
    -*) die "unknown option: $1" ;;
    *) positionals+=("$1"); shift ;;
  esac
done

[[ -n $host ]] || die 'set --host or TASK_RUN_SSH_HOST'
[[ $host != *$'\n'* && $host != *$'\r'* ]] || die 'host contains a line break'
[[ -n $root && $root == /* && $root =~ [^/] ]] || die 'remote root must be an absolute path other than /'
[[ $root != *$'\n'* && $root != *$'\r'* ]] || die 'remote root contains a line break'
root=${root%/}
[[ $root != */../* && $root != */.. && $root != */./* && $root != */. ]] \
  || die 'remote root must not contain dot traversal components'
ssh_options=(-o BatchMode=yes -o ConnectTimeout=10 -o PreferredAuthentications=publickey \
  -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no \
  -o GSSAPIAuthentication=no -o HostbasedAuthentication=no)

case $action in
  run)
    ((${#positionals[@]})) || die 'run requires -- command [arg ...]'
    [[ $follow == 0 ]] || die '--follow is valid only with logs'
    [[ $cache_max_gb =~ ^[0-9]{1,6}$ ]] || die 'cache maximum must be an integer from 0 to 999999 GiB'
    [[ $min_free_gb =~ ^[0-9]{1,6}$ ]] || die 'minimum free space must be an integer from 0 to 999999 GiB'
    cache_max_gb=$((10#$cache_max_gb))
    cache_max_kb=$((cache_max_gb * 1024 * 1024))
    min_free_gb=$((10#$min_free_gb))
    min_free_kb=$((min_free_gb * 1024 * 1024))
    repo_dir=$(git -C "$repo_dir" rev-parse --show-toplevel) || die 'not a Git repository'
    commit=$(git -C "$repo_dir" rev-parse --verify "${revision}^{commit}") || die "not a commit: $revision"
    short_commit=${commit:0:12}
    if [[ -z $repo_key ]]; then
      repo_key=$(default_repo_key "$repo_dir")
    fi
    valid_name "$repo_key" || die 'repo key must use 1-96 letters, digits, dots, underscores, or hyphens'
    if [[ -n $(git -C "$repo_dir" status --porcelain) ]]; then
      printf 'task-run-ssh: caller tree is dirty; sending committed snapshot %s only\n' "$commit" >&2
    fi
    if [[ -z $task_id ]]; then
      task_id=$(new_task_id)
    fi
    valid_name "$task_id" || die 'task ID must use 1-96 letters, digits, dots, underscores, or hyphens'

    mirror=$root/mirrors/$repo_key.git
    worktree=$root/worktrees/$repo_key/$task_id
    job=$root/jobs/$repo_key/$task_id
    cache=$root/cache/$repo_key
    job_tmp=$root/tmp/$repo_key/$task_id
    ref=refs/task-run-ssh/$task_id

    remote_bash "$root" "$mirror" "$repo_key" "$cache" "$cache_max_kb" "$min_free_kb" <<'REMOTE_INIT'
set -Eeuo pipefail
root=$1
mirror=$2
repo_key=$3
cache=$4
cache_max_kb=$5
min_free_kb=$6
umask 077
mkdir -p -- "$root/mirrors" "$root/worktrees/$repo_key" "$root/jobs/$repo_key" "$root/tmp/$repo_key" \
  "$cache/xdg" "$cache/npm" "$cache/yarn" "$cache/corepack" "$cache/gradle" "$cache/pub" \
  "$cache/ccache" "$cache/sccache" "$cache/home" "$cache/cargo" "$cache/go" "$cache/maven"
cache_kb=$(du -sk "$cache" | awk '{print $1}')
free_kb=$(df -Pk "$root" | awk 'NR==2 {print $4}')
[[ $cache_kb =~ ^[0-9]+$ ]] || { printf 'cannot measure cache size\n' >&2; exit 6; }
[[ $free_kb =~ ^[0-9]+$ ]] || { printf 'cannot measure remote root free space\n' >&2; exit 6; }
if ((cache_kb > cache_max_kb || free_kb < min_free_kb)); then
  find "$cache" -type f -mtime +30 -delete
  cache_kb=$(du -sk "$cache" | awk '{print $1}')
  free_kb=$(df -Pk "$root" | awk 'NR==2 {print $4}')
fi
if ((cache_kb > cache_max_kb)); then
  printf 'cache exceeds cap after pruning: %s KiB > %s KiB (%s)\n' "$cache_kb" "$cache_max_kb" "$cache" >&2
  exit 6
fi
if ((free_kb < min_free_kb)); then
  printf 'remote root below free-space floor: %s KiB < %s KiB (%s)\n' "$free_kb" "$min_free_kb" "$root" >&2
  exit 6
fi
if [[ ! -e $mirror/HEAD ]]; then
  mkdir -p -- "$mirror"
  git init --bare --quiet "$mirror"
fi
[[ $(git --git-dir="$mirror" rev-parse --is-bare-repository) == true ]]
REMOTE_INIT

    printf '%s\n' "$commit" \
      | git -C "$repo_dir" pack-objects --stdout --revs \
      | remote_exec git "--git-dir=$mirror" index-pack --stdin >/dev/null

    remote_commit=$(remote_exec git "--git-dir=$mirror" rev-parse "${commit}^{commit}")
    [[ $remote_commit == "$commit" ]] || die "remote object mismatch: expected $commit, got $remote_commit"

    remote_bash "$mirror" "$worktree" "$job" "$ref" "$commit" "$cache" "$job_tmp" \
      "$cache_max_kb" "$min_free_kb" <<'REMOTE_PREPARE'
set -Eeuo pipefail
mirror=$1
worktree=$2
job=$3
ref=$4
commit=$5
cache=$6
job_tmp=$7
cache_max_kb=$8
min_free_kb=$9
umask 077
[[ ! -e $worktree ]] || { printf 'task worktree already exists\n' >&2; exit 5; }
[[ ! -e $job_tmp ]] || { printf 'task temp directory already exists\n' >&2; exit 5; }
if git --git-dir="$mirror" rev-parse --verify --quiet "$ref" >/dev/null; then
  printf 'task ref already exists\n' >&2
  exit 5
fi
mkdir -- "$job"
mkdir -- "$job_tmp"
rollback() {
  git --git-dir="$mirror" worktree remove --force "$worktree" >/dev/null 2>&1 || true
  git --git-dir="$mirror" update-ref -d "$ref" >/dev/null 2>&1 || true
  rm -rf -- "$job" "$job_tmp"
}
trap rollback ERR
git --git-dir="$mirror" update-ref "$ref" "$commit"
[[ $(git --git-dir="$mirror" rev-parse "${ref}^{commit}") == "$commit" ]]
git --git-dir="$mirror" worktree add --detach --quiet "$worktree" "$commit"
[[ $(git -C "$worktree" rev-parse HEAD) == "$commit" ]]
cat > "$job/run.sh" <<'REMOTE_RUNNER'
#!/usr/bin/env bash
set -Eeuo pipefail
mirror=$1
worktree=$2
job=$3
ref=$4
keep=$5
cache=$6
job_tmp=$7
cache_max_kb=$8
min_free_kb=$9
shift 9

export XDG_CACHE_HOME=$cache/xdg
export HOME=$cache/home
export CARGO_HOME=$cache/cargo
export GOPATH=$cache/go
export MAVEN_CONFIG=$cache/maven
export npm_config_cache=$cache/npm
export YARN_CACHE_FOLDER=$cache/yarn
export COREPACK_HOME=$cache/corepack
export GRADLE_USER_HOME=$cache/gradle
export PUB_CACHE=$cache/pub
export CCACHE_DIR=$cache/ccache
export SCCACHE_DIR=$cache/sccache
export TMPDIR=$job_tmp
export TMP=$job_tmp
export TEMP=$job_tmp

write_state() {
  printf '%s\n' "$1" > "$job/status.tmp"
  mv -f -- "$job/status.tmp" "$job/status"
}

cleanup_checkout() {
  local failed=0
  cd /
  rm -rf -- "$job_tmp" || { printf 'failed to remove task temp: %s\n' "$job_tmp" >&2; failed=1; }
  if [[ $keep == 0 ]]; then
    if [[ -d $worktree ]] && ! git --git-dir="$mirror" worktree remove --force "$worktree" >/dev/null; then
      printf 'failed to remove task worktree: %s\n' "$worktree" >&2
      failed=1
    fi
    if git --git-dir="$mirror" rev-parse --verify --quiet "$ref" >/dev/null \
      && ! git --git-dir="$mirror" update-ref -d "$ref"; then
      printf 'failed to delete task ref: %s\n' "$ref" >&2
      failed=1
    fi
    git --git-dir="$mirror" worktree prune \
      || { printf 'failed to prune worktree metadata\n' >&2; failed=1; }
  fi
  return "$failed"
}

enforce_storage() {
  local cache_kb free_kb
  cache_kb=$(du -sk "$cache" | awk '{print $1}') || return 6
  free_kb=$(df -Pk "$cache" | awk 'NR==2 {print $4}') || return 6
  if ((cache_kb > cache_max_kb || free_kb < min_free_kb)); then
    find "$cache" -type f -mtime +30 -delete || return 6
    cache_kb=$(du -sk "$cache" | awk '{print $1}') || return 6
    free_kb=$(df -Pk "$cache" | awk 'NR==2 {print $4}') || return 6
  fi
  if ((cache_kb > cache_max_kb)); then
    printf 'cache exceeds cap after job: %s KiB > %s KiB (%s)\n' "$cache_kb" "$cache_max_kb" "$cache" >&2
    return 6
  fi
  if ((free_kb < min_free_kb)); then
    printf 'remote root below free-space floor after job: %s KiB < %s KiB\n' "$free_kb" "$min_free_kb" >&2
    return 6
  fi
}

finish() {
  local rc=$? cleanup_rc=0 storage_rc=0
  trap - EXIT HUP INT TERM
  cleanup_checkout || cleanup_rc=$?
  enforce_storage || storage_rc=$?
  if ((rc == 0 && cleanup_rc != 0)); then rc=$cleanup_rc; fi
  if ((rc == 0 && storage_rc != 0)); then rc=$storage_rc; fi
  printf '%s\n' "$rc" > "$job/exit-code.tmp"
  mv -f -- "$job/exit-code.tmp" "$job/exit-code"
  if ((rc == 0)); then write_state succeeded; else write_state failed; fi
  exit "$rc"
}

trap finish EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
printf '%s\n' "$$" > "$job/pid"
write_state running
exec > >(tee -a "$job/log") 2>&1
cd -- "$worktree"
"$@"
REMOTE_RUNNER
chmod 700 "$job/run.sh"
printf '%s\n' queued > "$job/status"
printf '%s\n' "$commit" > "$job/commit"
printf '%s\n' "$cache" > "$job/cache"
printf '%s\n' "$job_tmp" > "$job/tmp"
trap - ERR
REMOTE_PREPARE

    printf 'task_id=%s\ncommit=%s\ncache=%s\ntmp=%s\n' "$task_id" "$commit" "$cache" "$job_tmp"
    if [[ $detach == 1 ]]; then
      launch=$(remote_command nohup bash "$job/run.sh" "$mirror" "$worktree" "$job" "$ref" "$keep" \
        "$cache" "$job_tmp" "$cache_max_kb" "$min_free_kb" "${positionals[@]}")
      launch+=" >/dev/null 2>&1 </dev/null & printf '%s\\n' \"\$!\""
      pid=$(ssh "${ssh_options[@]}" -- "$host" "$launch")
      printf 'pid=%s\nstate=queued\n' "$pid"
      exit 0
    fi

    set +e
    remote_exec bash "$job/run.sh" "$mirror" "$worktree" "$job" "$ref" "$keep" \
      "$cache" "$job_tmp" "$cache_max_kb" "$min_free_kb" "${positionals[@]}"
    rc=$?
    set -e
    exit "$rc"
    ;;

  status|logs|clean)
    [[ $detach == 0 && $keep == 0 && -z $task_id && $revision == HEAD && $repo_dir == . \
      && $cache_max_set == 0 && $min_free_set == 0 ]] \
      || die "run-only option used with $action"
    ((${#positionals[@]} == 1)) || die "$action requires one task ID"
    task_id=${positionals[0]}
    valid_name "$task_id" || die 'invalid task ID'
    if [[ -z $repo_key ]]; then
      git rev-parse --is-inside-work-tree >/dev/null 2>&1 \
        || die "run from the repository or set --repo-key for $action"
      repo_key=$(default_repo_key .)
    fi
    valid_name "$repo_key" || die 'invalid repo key'
    mirror=$root/mirrors/$repo_key.git
    worktree=$root/worktrees/$repo_key/$task_id
    job=$root/jobs/$repo_key/$task_id
    ref=refs/task-run-ssh/$task_id

    if [[ $action == status ]]; then
      [[ $follow == 0 ]] || die '--follow is valid only with logs'
      remote_bash "$job" "$task_id" "$worktree" <<'REMOTE_STATUS'
set -Eeuo pipefail
job=$1
task_id=$2
worktree=$3
[[ -d $job ]] || { printf 'task not found: %s\n' "$task_id" >&2; exit 3; }
printf 'task_id=%s\nstate=%s\ncommit=%s\n' "$task_id" "$(cat "$job/status")" "$(cat "$job/commit")"
[[ ! -f $job/cache ]] || printf 'cache=%s\n' "$(cat "$job/cache")"
if [[ -f $job/tmp ]]; then
  job_tmp=$(cat "$job/tmp")
  [[ ! -d $job_tmp ]] || printf 'tmp=%s\n' "$job_tmp"
fi
[[ ! -f $job/exit-code ]] || printf 'exit_code=%s\n' "$(cat "$job/exit-code")"
[[ ! -d $worktree ]] || printf 'worktree=%s\n' "$worktree"
REMOTE_STATUS
    elif [[ $action == logs ]]; then
      if [[ $follow == 1 ]]; then
        remote_bash "$job" <<'REMOTE_LOG_FOLLOW'
set -Eeuo pipefail
job=$1
[[ -d $job ]] || { printf 'task not found\n' >&2; exit 3; }
touch "$job/log"
exec tail -n +1 -f "$job/log"
REMOTE_LOG_FOLLOW
      else
        remote_bash "$job" <<'REMOTE_LOG'
set -Eeuo pipefail
job=$1
[[ -d $job ]] || { printf 'task not found\n' >&2; exit 3; }
[[ ! -f $job/log ]] || cat "$job/log"
REMOTE_LOG
      fi
    else
      [[ $follow == 0 ]] || die '--follow is valid only with logs'
      job_tmp=$root/tmp/$repo_key/$task_id
      remote_bash "$mirror" "$worktree" "$job" "$ref" "$job_tmp" <<'REMOTE_CLEAN'
set -Eeuo pipefail
mirror=$1
worktree=$2
job=$3
ref=$4
job_tmp=$5
[[ -d $job ]] || { printf 'task not found\n' >&2; exit 3; }
state=$(cat "$job/status")
[[ $state != queued && $state != running ]] || { printf 'refusing to clean %s task\n' "$state" >&2; exit 4; }
[[ ! -d $worktree ]] || git --git-dir="$mirror" worktree remove --force "$worktree"
if git --git-dir="$mirror" rev-parse --verify --quiet "$ref" >/dev/null; then
  git --git-dir="$mirror" update-ref -d "$ref"
fi
git --git-dir="$mirror" worktree prune
rm -rf -- "$job" "$job_tmp"
REMOTE_CLEAN
    fi
    ;;

  -h|--help|help) usage ;;
  *) usage >&2; die "unknown action: $action" ;;
esac
