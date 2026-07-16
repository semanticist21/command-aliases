#!/usr/bin/env bash
set -Eeuo pipefail

script=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)/task-run-ssh.sh
tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/task-run-ssh-test.XXXXXX")
trap 'rm -rf "$tmp_dir"' EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

mkdir -p "$tmp_dir/bin"
cat > "$tmp_dir/bin/ssh" <<'MOCK_SSH'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >> "$MOCK_SSH_ARGS"
while (($#)) && [[ $1 != -- ]]; do shift; done
[[ ${1-} == -- ]] || exit 90
shift
host=${1-}
shift
[[ $host == mock ]] || exit 91
command=${1-}
exec bash -c "$command"
MOCK_SSH
chmod +x "$tmp_dir/bin/ssh"
export PATH="$tmp_dir/bin:$PATH"
export MOCK_SSH_ARGS="$tmp_dir/ssh.args"
: > "$MOCK_SSH_ARGS"

repo=$tmp_dir/repo
root=$tmp_dir/remote
git init --quiet "$repo"
git -C "$repo" config user.name tester
git -C "$repo" config user.email tester@example.invalid
printf 'fixture\n' > "$repo/file.txt"
git -C "$repo" add file.txt
git -C "$repo" commit --quiet -m fixture
commit=$(git -C "$repo" rev-parse HEAD)

run_output=$($script run --host mock --root "$root" --repo-dir "$repo" \
  --repo-key fixture --task-id sync-job -- \
  bash -c 'printf "cache=%s\ntmp=%s\nHOME=%s\n" "$XDG_CACHE_HOME" "$TMPDIR" "$HOME"')
[[ $run_output == *"commit=$commit"* ]] || fail 'exact commit missing from output'
[[ $run_output == *"cache=$root/cache/fixture"* ]] || fail 'cache path missing from output'
[[ ! -d $root/tmp/fixture/sync-job ]] || fail 'sync temp directory survived completion'
[[ ! -d $root/worktrees/fixture/sync-job ]] || fail 'sync worktree survived completion'
[[ $(cat "$root/jobs/fixture/sync-job/status") == succeeded ]] || fail 'sync status not succeeded'

status_output=$($script status --host mock --root "$root" --repo-key fixture sync-job)
[[ $status_output == *"state=succeeded"* ]] || fail 'status did not report success'
[[ $status_output == *"cache=$root/cache/fixture"* ]] || fail 'status did not report cache'
log_output=$($script logs --host mock --root "$root" --repo-key fixture sync-job)
[[ $log_output == *"cache=$root/cache/fixture/xdg"* ]] || fail 'cache environment not exported'
[[ $log_output == *"tmp=$root/tmp/fixture/sync-job"* ]] || fail 'job temp environment not exported'
grep -q "HOME=$root/cache/fixture/home" "$root/jobs/fixture/sync-job/log" \
  || fail 'external HOME not exported'
for option in PreferredAuthentications=publickey PasswordAuthentication=no \
  KbdInteractiveAuthentication=no GSSAPIAuthentication=no HostbasedAuthentication=no; do
  grep -q -- "$option" "$MOCK_SSH_ARGS" || fail "SSH option missing: $option"
done

mkdir -p "$root/cache/fixture"
printf 'recent\n' > "$root/cache/fixture/recent.bin"
if $script run --host mock --root "$root" --repo-dir "$repo" --repo-key fixture \
  --task-id overflow-job --cache-max-gb 0 -- true >"$tmp_dir/overflow.out" 2>&1; then
  fail 'over-cap cache did not fail closed'
fi
[[ ! -d $root/jobs/fixture/overflow-job ]] || fail 'over-cap run created task state'
rm -f "$root/cache/fixture/recent.bin"

if $script run --host mock --root "$root" --repo-dir "$repo" --repo-key fixture \
  --task-id post-overflow-job --cache-max-gb 0 -- \
  bash -c 'printf growth > "$XDG_CACHE_HOME/post-growth.bin"' \
  >"$tmp_dir/post-overflow.out" 2>&1; then
  fail 'post-job cache growth was accepted'
fi
[[ $(cat "$root/jobs/fixture/post-overflow-job/status") == failed ]] \
  || fail 'post-job cache overflow did not mark task failed'
[[ $(cat "$root/jobs/fixture/post-overflow-job/exit-code") == 6 ]] \
  || fail 'post-job cache overflow exit code differs from 6'
[[ ! -d $root/worktrees/fixture/post-overflow-job ]] \
  || fail 'post-job overflow left worktree'
rm -f "$root/cache/fixture/xdg/post-growth.bin"
$script clean --host mock --root "$root" --repo-key fixture post-overflow-job

if $script run --host mock --root "$root/../escape" --repo-dir "$repo" \
  --repo-key fixture --task-id traversal-job -- true >"$tmp_dir/traversal.out" 2>&1; then
  fail 'remote root traversal was accepted'
fi

if $script run --host mock --root "$root" --repo-dir "$repo" --repo-key fixture \
  --task-id free-space-job --min-free-gb 999999 -- true >"$tmp_dir/free-space.out" 2>&1; then
  fail 'remote root free-space floor did not fail closed'
fi
[[ ! -d $root/jobs/fixture/free-space-job ]] || fail 'low-free-space run created task state'

$script clean --host mock --root "$root" --repo-key fixture sync-job
[[ ! -d $root/jobs/fixture/sync-job ]] || fail 'clean left job state'

printf 'PASS: task-run-ssh\n'
