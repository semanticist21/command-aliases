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
# A repo can drop a `.dispatch-heavy.env` beside this script to set non-private
# defaults (DISPATCH_WORKFLOW, rsync excludes). It is sourced first; already-set
# shell env and flags override it. This file is COMMITTED — put only non-private
# values in it. Private hosts/paths/creds belong in your shell env, never here.
#
# Usage:
#   dispatch-heavy.sh [--via actions|ssh] [options] [-- REMOTE_CMD...]
#
#   --via actions|ssh        route (default: actions)
#   --workflow FILE          actions: workflow file name (default: $DISPATCH_WORKFLOW)
#   --ref BRANCH             actions: git ref to run (default: current branch)
#   -f, --field K=V          actions: workflow_dispatch input (repeatable)
#   --no-push                actions: do not push before dispatching
#   --allow-main             actions: permit pushing main/master (off by default)
#   --no-watch               actions: dispatch and return, do not stream the run
#   --host HOST              ssh: target host/alias (default: $TASK_RUN_SSH_HOST)
#   --root DIR               ssh: remote base dir (default: $TASK_RUN_SSH_ROOT)
#   --name NAME              ssh: snapshot dir name (default: repo basename)
#   --exclude PATTERN        ssh: extra rsync exclude (repeatable)
#   --cmd "CMD"              ssh: remote command as ONE shell string; use this for
#                            anything with shell operators (&& | > redirects, etc.)
#   --dry-run                print what would run, mutate nothing
#   -h, --help               this help
#
# ssh command forms:
#   --cmd "cd server && cargo test"   one shell string, operators interpreted remotely
#   -- make verify                    argv form: word boundaries preserved, NO operators
#   (`-- 'a && b'` would send `a && b` as one literal command — use --cmd for operators)
#
# Examples:
#   dispatch-heavy.sh                              # push branch + run heavy.yml, watch
#   dispatch-heavy.sh --via actions -f level=full  # with a workflow input
#   dispatch-heavy.sh --via ssh --cmd 'make verify' # snapshot + run remotely, no push

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
allow_main=0
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
    --allow-main) allow_main=1; shift ;;
    --no-watch) no_watch=1; shift ;;
    --host) ssh_host="${2:?}"; shift 2 ;;
    --root) ssh_root="${2:?}"; shift 2 ;;
    --name) snap_name="${2:?}"; shift 2 ;;
    --exclude) excludes+=("${2:?}"); shift 2 ;;
    --cmd) remote_cmd="${2:?}"; shift 2 ;;
    --dry-run) dry_run=1; shift ;;
    -h|--help) sed -n '4,55p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --) shift; [ $# -gt 0 ] && remote_cmd="$(printf '%q ' "$@")"; break ;;
    *) die "unknown argument: $1 (see --help)" ;;
  esac
done

# Execute an argv directly (no eval → no word-splitting/injection). Under
# --dry-run, print the shell-quoted command instead of running it.
run() {
  if [ "$dry_run" = 1 ]; then
    printf '+'; printf ' %q' "$@"; printf '\n'
  else
    "$@"
  fi
}

case "$via" in
  actions)
    need git; need gh
    [ -n "$workflow" ] || die "actions route needs --workflow or DISPATCH_WORKFLOW"
    [ -z "$ref" ] && ref="$(git rev-parse --abbrev-ref HEAD)"
    [ "$ref" != HEAD ] || die "detached HEAD; pass --ref explicitly"
    if [ "$no_push" = 0 ]; then
      case "$ref" in
        main|master) [ "$allow_main" = 1 ] || die "refusing to push protected branch '$ref'; use a feature branch, --no-push, or --allow-main" ;;
      esac
      run git push origin "$ref"
    fi
    # Baseline the newest existing dispatch run so we can tell the new one apart
    # (a git push above may itself trigger a pull_request run — never watch that).
    before_id=0
    if [ "$no_watch" = 0 ] && [ "$dry_run" = 0 ]; then
      before_id="$(gh run list --workflow "$workflow" --event workflow_dispatch --limit 1 \
        --json databaseId --jq '.[0].databaseId // 0' 2>/dev/null || echo 0)"
    fi
    dispatch=(gh workflow run "$workflow" --ref "$ref")
    for f in "${fields[@]:-}"; do [ -n "$f" ] && dispatch+=(-f "$f"); done
    run "${dispatch[@]}"
    { [ "$dry_run" = 1 ] || [ "$no_watch" = 1 ]; } && exit 0
    # Poll for a NEW workflow_dispatch run (id != baseline), then follow it.
    run_id=''
    tries=0
    while [ "$tries" -lt 15 ]; do
      sleep 2
      run_id="$(gh run list --workflow "$workflow" --event workflow_dispatch --limit 1 \
        --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null || true)"
      [ -n "$run_id" ] && [ "$run_id" != "$before_id" ] && break
      run_id=''
      tries=$((tries + 1))
    done
    [ -n "$run_id" ] || die "dispatched, but no new run appeared in ~30s; check: gh run list --workflow $workflow"
    exec gh run watch "$run_id" --exit-status
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
    # Guard --delete: only sync into a dir we own — new, empty, or a prior snapshot
    # (marked). Refuse an occupied dir so a --root/--name typo can't wipe real data.
    if [ "$dry_run" = 0 ]; then
      remote_check="$(printf 'd=%q; if [ ! -e "$d" ]; then echo new; elif [ -e "$d/.dispatch-heavy-snapshot" ]; then echo snap; elif [ -z "$(ls -A "$d" 2>/dev/null)" ]; then echo empty; else echo occupied; fi' "$dest")"
      state="$(ssh "${ssh_opts[@]}" "$ssh_host" "$remote_check" 2>/dev/null || echo unreachable)"
      case "$state" in
        new|snap|empty) : ;;
        occupied) die "remote $ssh_host:$dest is non-empty and unmarked; refusing --delete. Use a fresh --name/--root." ;;
        *) die "cannot reach $ssh_host or stat $dest" ;;
      esac
      ssh "${ssh_opts[@]}" "$ssh_host" "mkdir -p $(printf %q "$dest") && touch $(printf %q "$dest/.dispatch-heavy-snapshot")"
    fi
    run rsync "${rsync_opts[@]}" -e "ssh ${ssh_opts[*]}" "$src/" "$ssh_host:$dest/"
    run ssh "${ssh_opts[@]}" "$ssh_host" "cd $(printf %q "$dest") && $remote_cmd"
    ;;
  *) die "unknown --via: $via (actions|ssh)" ;;
esac
