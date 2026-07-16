#!/usr/bin/env bash
set -Eeuo pipefail

target_org=Kobbokkom

usage() {
  cat <<'USAGE'
Usage:
  transfer-repo.sh --source OWNER/REPO [--new-name NAME]
  transfer-repo.sh --source OWNER/REPO [--new-name NAME] --execute --confirm VALUE

Options:
  --source OWNER/REPO       Repository to transfer
  --new-name NAME           Name in Kobbokkom (default: source name)
  --visibility VISIBILITY   Explicit post-transfer visibility: public, private, internal
  --execute                 Perform the transfer after preflight
  --confirm VALUE           Exact confirmation printed by dry-run
  --update-remote REMOTE    Update this local Git remote after a verified transfer
  -h, --help                Show this help

Dry-run is the default. The target organization is always Kobbokkom.
USAGE
}

die() {
  printf 'org-kobbokkom-repo-migration: %s\n' "$*" >&2
  exit 2
}

gh_api() {
  gh api --hostname github.com "$@"
}

valid_owner() {
  [[ $1 =~ ^[A-Za-z0-9][A-Za-z0-9-]{0,38}$ ]]
}

valid_repo_name() {
  [[ $1 =~ ^[A-Za-z0-9._-]{1,100}$ && $1 != . && $1 != .. ]]
}

lowercase() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

count_lines() {
  awk 'END { print NR + 0 }' "$1"
}

urlencode() {
  local value=$1 result='' char hex index
  LC_ALL=C
  for ((index = 0; index < ${#value}; index++)); do
    char=${value:index:1}
    case $char in
      [A-Za-z0-9._~-]) result+=$char ;;
      *) printf -v hex '%%%02X' "'$char"; result+=$hex ;;
    esac
  done
  printf '%s' "$result"
}

api_lines() {
  local endpoint=$1 filter=$2 output=$3
  shift 3
  gh_api --method GET "$endpoint" --paginate "$@" --jq "$filter" \
    | LC_ALL=C sort -u > "$output"
}

repo_exists() {
  local full_name=$1 error_file=$2
  if gh_api "repos/$full_name" --silent >/dev/null 2>"$error_file"; then
    return 0
  fi
  if grep -Eq 'HTTP 404|"status"[[:space:]]*:[[:space:]]*"?404' "$error_file"; then
    return 1
  fi
  sed 's/^/GitHub: /' "$error_file" >&2
  die "cannot determine whether $full_name already exists"
}

snapshot_packages() {
  local full_name=$1 output=$2 owner owner_type endpoint package_type
  owner=${full_name%%/*}
  owner_type=$(gh_api "users/$owner" --jq .type)
  case $owner_type in
    Organization) endpoint="orgs/$owner/packages" ;;
    User) endpoint="users/$owner/packages" ;;
    *) die "unsupported repository owner type for package audit: $owner_type" ;;
  esac

  : > "$output"
  for package_type in npm maven rubygems docker nuget container; do
    gh_api --method GET "$endpoint" --paginate -f "package_type=$package_type" \
      --jq ".[] | select(.repository.full_name == \"$full_name\") | [.package_type, .name] | @tsv" \
      >> "$output" || die 'package audit failed; the current gh login may need read:packages scope'
  done
  LC_ALL=C sort -u -o "$output" "$output"
}

snapshot_pages() {
  local full_name=$1 output=$2 has_pages
  has_pages=$(gh_api "repos/$full_name" --jq '.has_pages')
  if [[ $has_pages == false ]]; then
    printf 'absent\n' > "$output"
    return
  fi
  gh_api "repos/$full_name/pages" \
    --jq '[.build_type, (.source.branch // ""), (.source.path // ""), (.https_enforced | tostring), (.cname // "")] | @tsv' \
    > "$output"
}

snapshot_rulesets() {
  local full_name=$1 directory=$2 ruleset_id
  api_lines "repos/$full_name/rulesets" '.[].id' "$directory/ruleset-ids"
  : > "$directory/rulesets"
  while IFS= read -r ruleset_id; do
    [[ $ruleset_id =~ ^[0-9]+$ ]] || die 'GitHub returned an invalid ruleset ID'
    gh_api "repos/$full_name/rulesets/$ruleset_id" \
      --jq '{name, enforcement, bypass_actors, conditions, rules} | @json' \
      >> "$directory/rulesets"
  done < "$directory/ruleset-ids"
  rm -f "$directory/ruleset-ids"
  LC_ALL=C sort -u -o "$directory/rulesets" "$directory/rulesets"
}

snapshot_actions_permissions() {
  local full_name=$1 output=$2 allowed_actions
  gh_api "repos/$full_name/actions/permissions" \
    --jq '{enabled, allowed_actions, sha_pinning_required} | @json' > "$output"
  gh_api "repos/$full_name/actions/permissions/workflow" \
    --jq '{default_workflow_permissions, can_approve_pull_request_reviews} | @json' >> "$output"
  allowed_actions=$(gh_api "repos/$full_name/actions/permissions" --jq .allowed_actions)
  if [[ $allowed_actions == selected ]]; then
    gh_api "repos/$full_name/actions/permissions/selected-actions" \
      --jq '{github_owned_allowed, verified_allowed, patterns_allowed} | @json' >> "$output"
  fi
  LC_ALL=C sort -u -o "$output" "$output"
}

snapshot_repository() {
  local full_name=$1 directory=$2 environment encoded_environment secret output
  mkdir -p "$directory"
  chmod 700 "$directory"

  api_lines "repos/$full_name/actions/workflows" \
    '.workflows[] | [.id, .path, .state] | @tsv' "$directory/actions-workflows"
  snapshot_actions_permissions "$full_name" "$directory/actions-permissions"
  snapshot_rulesets "$full_name" "$directory"
  snapshot_pages "$full_name" "$directory/pages"
  snapshot_packages "$full_name" "$directory/packages"
  api_lines "repos/$full_name/hooks" \
    '.[] | {id, name, active, events: (.events | sort), config} | @json' "$directory/webhooks"
  api_lines "repos/$full_name/actions/secrets" \
    '.secrets[].name' "$directory/actions-secrets"
  api_lines "repos/$full_name/actions/variables" \
    '.variables[] | {name, value} | @json' "$directory/actions-variables"
  api_lines "repos/$full_name/keys" \
    '.[] | {id, title, key, read_only} | @json' "$directory/deploy-keys"
  api_lines "repos/$full_name/environments" \
    '.environments[].name' "$directory/environment-names"
  : > "$directory/environments"
  : > "$directory/environment-secrets"
  : > "$directory/environment-variables"
  : > "$directory/environment-branch-policies"
  while IFS= read -r environment; do
    [[ -n $environment ]] || continue
    encoded_environment=$(urlencode "$environment")
    gh_api --method GET "repos/$full_name/environments/$encoded_environment" \
      --jq '{name, protection_rules, deployment_branch_policy, can_admins_bypass} | @json' \
      >> "$directory/environments"
    gh_api --method GET "repos/$full_name/environments/$encoded_environment/secrets" --paginate \
      --jq '.secrets[].name' > "$directory/environment-secret-names"
    while IFS= read -r secret; do
      printf '%s\t%s\n' "$encoded_environment" "$secret" >> "$directory/environment-secrets"
    done < "$directory/environment-secret-names"
    gh_api --method GET "repos/$full_name/environments/$encoded_environment/variables" --paginate \
      --jq '.variables[] | {name, value} | @json' > "$directory/environment-variable-items"
    while IFS= read -r secret; do
      printf '%s\t%s\n' "$encoded_environment" "$secret" >> "$directory/environment-variables"
    done < "$directory/environment-variable-items"
    gh_api --method GET \
      "repos/$full_name/environments/$encoded_environment/deployment-branch-policies" --paginate \
      --jq '.branch_policies[] | {id, name, type} | @json' > "$directory/environment-policy-items"
    while IFS= read -r secret; do
      printf '%s\t%s\n' "$encoded_environment" "$secret" >> "$directory/environment-branch-policies"
    done < "$directory/environment-policy-items"
  done < "$directory/environment-names"
  rm -f "$directory/environment-secret-names" "$directory/environment-variable-items" \
    "$directory/environment-policy-items"
  for output in environments environment-secrets environment-variables environment-branch-policies; do
    LC_ALL=C sort -u -o "$directory/$output" "$directory/$output"
  done
}

compare_snapshots() {
  local before=$1 after=$2 category mismatches=0
  for category in actions-workflows actions-permissions rulesets pages packages webhooks actions-secrets \
    actions-variables deploy-keys environments environment-secrets environment-variables \
    environment-branch-policies; do
    if cmp -s "$before/$category" "$after/$category"; then
      printf 'verified %-18s %s item(s)\n' "$category" "$(count_lines "$after/$category")"
    else
      printf 'MISMATCH %-18s inspect GitHub settings\n' "$category" >&2
      mismatches=1
    fi
  done
  ((mismatches == 0)) || return 1
}

update_git_remote() {
  local remote=$1 source_full=$2 target_full=$3 current normalized new_url
  git rev-parse --show-toplevel >/dev/null 2>&1 \
    || die '--update-remote must run inside the matching local Git repository'
  current=$(git remote get-url "$remote") \
    || die "local Git remote does not exist: $remote"
  normalized=${current%.git}
  case $normalized in
    "git@github.com:$source_full"|"ssh://git@github.com/$source_full")
      new_url="git@github.com:$target_full.git"
      ;;
    "https://github.com/$source_full"|"http://github.com/$source_full")
      new_url="https://github.com/$target_full.git"
      ;;
    *)
      die "local remote $remote does not point to the requested source repository"
      ;;
  esac
  git remote set-url "$remote" "$new_url"
  printf 'updated local remote: %s\n' "$remote"
}

source_full=''
new_name=''
requested_visibility=''
execute=0
confirmation=''
update_remote=''

while (($#)); do
  case $1 in
    --source) (($# >= 2)) || die '--source requires OWNER/REPO'; source_full=$2; shift 2 ;;
    --new-name) (($# >= 2)) || die '--new-name requires a value'; new_name=$2; shift 2 ;;
    --visibility) (($# >= 2)) || die '--visibility requires a value'; requested_visibility=$2; shift 2 ;;
    --execute) execute=1; shift ;;
    --confirm) (($# >= 2)) || die '--confirm requires a value'; confirmation=$2; shift 2 ;;
    --update-remote) (($# >= 2)) || die '--update-remote requires a remote name'; update_remote=$2; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

[[ -n $source_full ]] || die '--source is required'
[[ $source_full == */* && $source_full != */*/* ]] || die '--source must be exactly OWNER/REPO'
source_owner=${source_full%%/*}
source_repo=${source_full#*/}
valid_owner "$source_owner" || die 'source owner contains unsupported characters'
valid_repo_name "$source_repo" || die 'source repository name contains unsupported characters'
[[ $(lowercase "$source_owner") != $(lowercase "$target_org") ]] \
  || die 'source is already owned by Kobbokkom'

if [[ -z $new_name ]]; then
  new_name=$source_repo
fi
valid_repo_name "$new_name" || die 'target repository name contains unsupported characters'
target_full=$target_org/$new_name

case $requested_visibility in
  ''|public|private|internal) ;;
  *) die '--visibility must be public, private, or internal' ;;
esac
((execute == 1)) || [[ -z $confirmation ]] || die '--confirm is valid only with --execute'
((execute == 1)) || [[ -z $update_remote ]] || die '--update-remote requires --execute'

command -v gh >/dev/null 2>&1 || die 'gh is required'
gh auth status -h github.com >/dev/null 2>&1 || die 'gh is not authenticated to github.com'
viewer=$(gh_api user --jq .login)
source_metadata=$(gh_api "repos/$source_full" --jq '[.permissions.admin, .visibility, .id] | @tsv')
IFS=$'\t' read -r source_admin source_visibility source_id <<< "$source_metadata"
[[ $source_admin == true ]] || die "$viewer does not have admin permission on $source_full"
[[ $source_id =~ ^[0-9]+$ ]] || die 'GitHub returned an invalid source repository ID'

expected_confirmation="$source_full@$source_id->$target_full"
if [[ -n $requested_visibility ]]; then
  expected_confirmation+=";visibility=$requested_visibility"
fi
if ((execute == 1)); then
  [[ $confirmation == "$expected_confirmation" ]] \
    || die "confirmation mismatch; expected: $expected_confirmation"
fi

membership=$(gh_api "user/memberships/orgs/$target_org" --jq '[.state, .role] | @tsv')
IFS=$'\t' read -r membership_state membership_role <<< "$membership"
[[ $membership_state == active && $membership_role == admin ]] \
  || die "$viewer must be an active owner of $target_org"

tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/org-kobbokkom-migration.XXXXXX")
chmod 700 "$tmp_dir"
trap 'rm -rf "$tmp_dir"' EXIT

if repo_exists "$target_full" "$tmp_dir/target-lookup-error"; then
  die "target repository already exists: $target_full"
fi

printf 'preflight source: %s\n' "$source_full"
printf 'preflight target: %s\n' "$target_full"
printf 'authenticated as: %s\n' "$viewer"
printf 'source visibility: %s\n' "$source_visibility"
snapshot_repository "$source_full" "$tmp_dir/before"
printf 'audit snapshot: Actions, rulesets, Pages, packages, webhooks, secrets, environments readable\n'

if ((execute == 0)); then
  printf 'dry-run only; no repository or local remote changed\n'
  printf "execute with --confirm '%s'\n" "$expected_confirmation"
  exit 0
fi

printf 'transferring: %s -> %s\n' "$source_full" "$target_full"
gh_api --method POST "repos/$source_full/transfer" \
  -f "new_owner=$target_org" -f "new_name=$new_name" >/dev/null

deadline=$((SECONDS + 300))
while ((SECONDS < deadline)); do
  if target_metadata=$(gh_api "repos/$target_full" --jq '[.owner.login, .name, .id] | @tsv' 2>/dev/null); then
    IFS=$'\t' read -r observed_owner observed_name observed_id <<< "$target_metadata"
    if [[ $(lowercase "$observed_owner") == $(lowercase "$target_org") \
      && $(lowercase "$observed_name") == $(lowercase "$new_name") \
      && $observed_id == "$source_id" ]]; then
      break
    fi
  fi
  sleep 2
done
[[ ${observed_owner:-} != '' \
  && $(lowercase "$observed_owner") == $(lowercase "$target_org") \
  && $(lowercase "$observed_name") == $(lowercase "$new_name") \
  && ${observed_id:-} == "$source_id" ]] \
  || die "transfer was accepted but $target_full did not become readable within 300 seconds"
printf 'transfer reachable: %s\n' "$target_full"

if [[ -n $requested_visibility ]]; then
  gh_api --method PATCH "repos/$target_full" -f "visibility=$requested_visibility" >/dev/null
fi
target_visibility=$(gh_api "repos/$target_full" --jq .visibility)
expected_visibility=${requested_visibility:-$source_visibility}
[[ $target_visibility == "$expected_visibility" ]] \
  || die "visibility mismatch: expected $expected_visibility, got $target_visibility"
printf 'verified visibility: %s\n' "$target_visibility"

snapshot_repository "$target_full" "$tmp_dir/after"
compare_snapshots "$tmp_dir/before" "$tmp_dir/after" \
  || die 'post-transfer audit mismatch; inspect the reported GitHub settings'

if [[ -n $update_remote ]]; then
  update_git_remote "$update_remote" "$source_full" "$target_full"
fi
printf 'migration verified: %s\n' "$target_full"
