#!/usr/bin/env bash
set -euo pipefail
#
# dispatch-heavy.sh — send heavy work to a remote runner from a local checkout.
#
# Two routes, picked with --via:
#   actions (default) : dispatch a workflow_dispatch workflow on the remote runner.
#                       The branch must exist on the remote, so this route pushes
#                       the current branch first (unless --no-push). Logs/artifacts
#                       land in GitHub Actions.
#   ssh               : rsync a clean snapshot of the working tree to a remote host
#                       and run a command there. No commit, no push, no queue —
#                       output streams back to your terminal. Use for macOS-only or
#                       off-CI heavy work.
#
# This template hardcodes NO hosts or paths. Configure via environment (usually
# already exported in your shell profile) or flags:
#
#   DISPATCH_WORKFLOW    workflow file for the actions route (e.g. heavy.yml)
#   TASK_RUN_SSH_HOST    ssh alias/host for the ssh route
#   TASK_RUN_SSH_ROOT    remote base dir under which snapshots are placed
#
# A repo can drop a `.dispatch-heavy.env` beside this script (git-ignored) to set
# per-repo defaults for DISPATCH_WORKFLOW / remote command / rsync excludes.
#
# Usage:
#   dispatch-heavy.sh [--via actions|ssh] [options] [-- REMOTE_CMD...]
#
#   --via actions|ssh        route (default: actions)
#   --workflow FILE          actions: workflow file name (default: $DISPATCH_WORKFLOW)
#   --ref BRANCH             actions: git ref to run (default: current branch)
#   -f, --field K=V          actions: workflow_dispatch input (repeatable)
#   --no-push                actions: do not push before dispatching
#   --no-watch               actions: dispatch and return, do not stream the run
#   --host HOST              ssh: target host/alias (default: $TASK_RUN_SSH_HOST)
#   --root DIR               ssh: remote base dir (default: $TASK_RUN_SSH_ROOT)
#   --name NAME              ssh: snapshot dir name (default: repo basename)
#   --exclude PATTERN        ssh: extra rsync exclude (repeatable)
#   --cmd "CMD"              ssh: remote command (or pass after `--`)
#   --dry-run                print what would run, mutate nothing
#   -h, --help               this help
#
# Examples:
#   dispatch-heavy.sh                              # push branch + run heavy.yml, watch
#   dispatch-heavy.sh --via actions -f level=full  # with a workflow input
#   dispatch-heavy.sh --via ssh -- make verify     # snapshot + run remotely, no push

die() { printf 'dispatch-heavy: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing command: $1"; }

# Repo-local defaults, if present next to the script. Source it FIRST so a
# `: "${DISPATCH_WORKFLOW:=heavy.yml}"` line sets a default; already-exported
# shell env and command-line flags still override it below.
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$script_dir/.dispatch-heavy.env" ] && . "$script_dir/.dispatch-heavy.env"

via=actions
workflow="${DISPATCH_WORKFLOW:-}"
ref=''
no_push=0
no_watch=0
ssh_host="${TASK_RUN_SSH_HOST:-}"
ssh_root="${TASK_RUN_SSH_ROOT:-}"
snap_name=''
remote_cmd=''
dry_run=0
declare -a fields=()
declare -a excludes=()

while [ $# -gt 0 ]; do
  case "$1" in
    --via) via="${2:?}"; shift 2 ;;
    --workflow) workflow="${2:?}"; shift 2 ;;
    --ref) ref="${2:?}"; shift 2 ;;
    -f|--field) fields+=("${2:?}"); shift 2 ;;
    --no-push) no_push=1; shift ;;
    --no-watch) no_watch=1; shift ;;
    --host) ssh_host="${2:?}"; shift 2 ;;
    --root) ssh_root="${2:?}"; shift 2 ;;
    --name) snap_name="${2:?}"; shift 2 ;;
    --exclude) excludes+=("${2:?}"); shift 2 ;;
    --cmd) remote_cmd="${2:?}"; shift 2 ;;
    --dry-run) dry_run=1; shift ;;
    -h|--help) sed -n '4,60p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --) shift; remote_cmd="$*"; break ;;
    *) die "unknown argument: $1 (see --help)" ;;
  esac
done

run() { if [ "$dry_run" = 1 ]; then printf '+ %s\n' "$*"; else eval "$@"; fi; }

case "$via" in
  actions)
    need git; need gh
    [ -n "$workflow" ] || die "actions route needs --workflow or DISPATCH_WORKFLOW"
    [ -z "$ref" ] && ref="$(git rev-parse --abbrev-ref HEAD)"
    [ "$ref" != HEAD ] || die "detached HEAD; pass --ref explicitly"
    if [ "$no_push" = 0 ]; then
      run "git push origin $(printf %q "$ref")"
    fi
    dispatch=(gh workflow run "$workflow" --ref "$ref")
    for f in "${fields[@]:-}"; do [ -n "$f" ] && dispatch+=(-f "$f"); done
    run "$(printf '%q ' "${dispatch[@]}")"
    [ "$dry_run" = 1 ] && exit 0
    if [ "$no_watch" = 0 ]; then
      # Give GitHub a moment to register the run, then follow the newest one.
      run_id="$(gh run list --workflow "$workflow" --branch "$ref" --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)"
      [ -n "$run_id" ] && exec gh run watch "$run_id" --exit-status
      exec gh run watch --exit-status
    fi
    ;;
  ssh)
    need rsync; need ssh
    [ -n "$ssh_host" ] || die "ssh route needs --host or TASK_RUN_SSH_HOST"
    [ -n "$ssh_root" ] || die "ssh route needs --root or TASK_RUN_SSH_ROOT"
    [ -n "$remote_cmd" ] || die "ssh route needs --cmd or a command after --"
    src="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
    [ -z "$snap_name" ] && snap_name="$(basename "$src")"
    dest="$ssh_root/$snap_name"
    # Never send VCS metadata or bulky build output; deps live on the remote.
    rsync_opts=(-az --delete
      --exclude '.git' --exclude 'node_modules' --exclude 'target'
      --exclude 'build' --exclude 'dist' --exclude '.venv' --exclude 'Pods')
    for e in "${excludes[@]:-}"; do [ -n "$e" ] && rsync_opts+=(--exclude "$e"); done
    ssh_opts=(-o BatchMode=yes -o ConnectTimeout=10)
    run "rsync ${rsync_opts[*]} -e $(printf %q "ssh ${ssh_opts[*]}") $(printf %q "$src/") $(printf %q "$ssh_host:$dest/")"
    run "ssh ${ssh_opts[*]} $(printf %q "$ssh_host") $(printf %q "cd $dest && $remote_cmd")"
    ;;
  *) die "unknown --via: $via (actions|ssh)" ;;
esac
