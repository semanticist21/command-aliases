#!/usr/bin/env bash
set -Eeuo pipefail

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
script=$script_dir/transfer-repo.sh
tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/org-kobbokkom-test.XXXXXX")
trap 'rm -rf "$tmp_dir"' EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

mkdir -p "$tmp_dir/bin"
cat > "$tmp_dir/bin/gh" <<'MOCK_GH'
#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${1-} == auth && ${2-} == status ]]; then
  exit 0
fi
[[ ${1-} == api ]] || exit 90
shift

method=GET
endpoint=''
filter=''
package_type=''
new_name=''
visibility=''
while (($#)); do
  case $1 in
    --hostname) shift 2 ;;
    --method) method=$2; shift 2 ;;
    --jq) filter=$2; shift 2 ;;
    -f)
      case $2 in
        package_type=*) package_type=${2#*=} ;;
        new_name=*) new_name=${2#*=} ;;
        visibility=*) visibility=${2#*=} ;;
      esac
      shift 2
      ;;
    --paginate|--silent) shift ;;
    *) [[ -z $endpoint ]] && endpoint=$1; shift ;;
  esac
done

printf '%s %s\n' "$method" "$endpoint" >> "$MOCK_GH_LOG"

if [[ $method == POST && $endpoint == repos/source/repo/transfer ]]; then
  printf '%s\nprivate\n' "$new_name" > "$MOCK_GH_STATE"
  exit 0
fi
if [[ $method == PATCH && $endpoint == repos/Kobbokkom/* ]]; then
  name=$(sed -n '1p' "$MOCK_GH_STATE")
  printf '%s\n%s\n' "$name" "$visibility" > "$MOCK_GH_STATE"
  exit 0
fi
if [[ $endpoint == user ]]; then
  printf 'tester\n'
  exit 0
fi
if [[ $endpoint == user/memberships/orgs/Kobbokkom ]]; then
  printf 'active\tadmin\n'
  exit 0
fi
if [[ $endpoint == users/source ]]; then
  printf 'User\n'
  exit 0
fi
if [[ $endpoint == users/Kobbokkom ]]; then
  printf 'Organization\n'
  exit 0
fi
if [[ $endpoint == repos/source/repo ]]; then
  case $filter in
    *permissions.admin*) printf 'true\tprivate\t4242\n' ;;
    *.has_pages*) printf 'false\n' ;;
    *) printf 'source\trepo\n' ;;
  esac
  exit 0
fi
if [[ $endpoint =~ ^repos/Kobbokkom/[^/]+$ ]]; then
  if [[ ${MOCK_TARGET_EXISTS:-0} == 1 || -s $MOCK_GH_STATE ]]; then
    name=${endpoint##*/}
    stored_visibility=private
    if [[ -s $MOCK_GH_STATE ]]; then
      name=$(sed -n '1p' "$MOCK_GH_STATE")
      stored_visibility=$(sed -n '2p' "$MOCK_GH_STATE")
    fi
    case $filter in
      *.owner.login*) printf 'Kobbokkom\t%s\t4242\n' "$name" ;;
      *.has_pages*) printf 'false\n' ;;
      *.visibility*) printf '%s\n' "$stored_visibility" ;;
      *) printf '{}\n' ;;
    esac
    exit 0
  fi
  printf 'gh: Not Found (HTTP 404)\n' >&2
  exit 1
fi

case $endpoint in
  */actions/workflows) printf '10\t.github/workflows/ci.yml\tactive\n' ;;
  */actions/permissions)
    case $filter in
      *.allowed_actions) printf 'all\n' ;;
      *) printf '{"enabled":true,"allowed_actions":"all","sha_pinning_required":false}\n' ;;
    esac
    ;;
  */actions/permissions/workflow) printf '{"default_workflow_permissions":"read","can_approve_pull_request_reviews":false}\n' ;;
  */rulesets) printf '20\n' ;;
  */rulesets/20) printf '{"name":"main","enforcement":"active","bypass_actors":[],"conditions":{},"rules":[]}\n' ;;
  */hooks) printf '{"id":30,"name":"web","active":true,"events":["push"],"config":{"url":"https://example.invalid/hook"}}\n' ;;
  */actions/secrets) printf 'DEPLOY_TOKEN\n' ;;
  */actions/variables)
    if [[ ${MOCK_AUDIT_DRIFT:-0} == 1 && $endpoint == repos/Kobbokkom/* ]]; then
      printf '{"name":"MODE","value":"changed"}\n'
    else
      printf '{"name":"MODE","value":"same"}\n'
    fi
    ;;
  */keys) printf '{"id":40,"title":"deploy","key":"ssh-ed25519 fixture","read_only":true}\n' ;;
  */environments) printf 'production\n' ;;
  */environments/production) printf '{"name":"production","protection_rules":[],"deployment_branch_policy":null,"can_admins_bypass":true}\n' ;;
  */environments/production/secrets) printf 'ENV_TOKEN\n' ;;
  */environments/production/variables) printf '{"name":"REGION","value":"test"}\n' ;;
  */environments/production/deployment-branch-policies) printf '{"id":50,"name":"main","type":"branch"}\n' ;;
  users/source/packages|orgs/Kobbokkom/packages)
    printf '%s\tpackage\n' "$package_type"
    ;;
  *) printf 'unexpected mock endpoint: %s\n' "$endpoint" >&2; exit 91 ;;
esac
MOCK_GH
chmod +x "$tmp_dir/bin/gh"

export PATH="$tmp_dir/bin:$PATH"
export MOCK_GH_LOG="$tmp_dir/gh.log"
export MOCK_GH_STATE="$tmp_dir/gh.state"

: > "$MOCK_GH_LOG"
dry_output=$($script --source source/repo --new-name dest)
[[ $dry_output == *"dry-run only"* ]] || fail 'dry-run marker missing'
[[ $dry_output == *"--confirm 'source/repo@4242->Kobbokkom/dest'"* ]] \
  || fail 'exact confirmation missing'
! grep -q '^POST ' "$MOCK_GH_LOG" || fail 'dry-run called transfer API'

if $script --source source/repo --new-name dest --execute --confirm wrong \
  >"$tmp_dir/wrong.out" 2>&1; then
  fail 'wrong confirmation was accepted'
fi
! grep -q '^POST ' "$MOCK_GH_LOG" || fail 'wrong confirmation called transfer API'

MOCK_TARGET_EXISTS=1
export MOCK_TARGET_EXISTS
if $script --source source/repo --new-name dest >"$tmp_dir/collision.out" 2>&1; then
  fail 'target collision was accepted'
fi
grep -q 'target repository already exists' "$tmp_dir/collision.out" \
  || fail 'target collision error missing'
unset MOCK_TARGET_EXISTS

: > "$MOCK_GH_LOG"
: > "$MOCK_GH_STATE"
$script --source source/repo --new-name dest --execute \
  --confirm 'source/repo@4242->Kobbokkom/dest' > "$tmp_dir/execute.out"
grep -q 'migration verified: Kobbokkom/dest' "$tmp_dir/execute.out" \
  || fail 'successful verification missing'
[[ $(grep -c '^POST repos/source/repo/transfer$' "$MOCK_GH_LOG") == 1 ]] \
  || fail 'transfer API call count differs from one'

: > "$MOCK_GH_LOG"
: > "$MOCK_GH_STATE"
$script --source source/repo --new-name dest --visibility public --execute \
  --confirm 'source/repo@4242->Kobbokkom/dest;visibility=public' > "$tmp_dir/visibility.out"
grep -q '^PATCH repos/Kobbokkom/dest$' "$MOCK_GH_LOG" \
  || fail 'explicit visibility did not call PATCH'
grep -q 'verified visibility: public' "$tmp_dir/visibility.out" \
  || fail 'explicit visibility was not verified'

: > "$MOCK_GH_LOG"
: > "$MOCK_GH_STATE"
git -C "$tmp_dir" init --quiet local-repo
git -C "$tmp_dir/local-repo" remote add origin https://github.com/source/repo.git
(
  cd "$tmp_dir/local-repo"
  $script --source source/repo --new-name dest --execute \
    --confirm 'source/repo@4242->Kobbokkom/dest' --update-remote origin >/dev/null
)
[[ $(git -C "$tmp_dir/local-repo" remote get-url origin) == https://github.com/Kobbokkom/dest.git ]] \
  || fail 'explicit local remote update failed'

for invalid_args in '--source source/.' '--source source/repo --new-name ..'; do
  if $script $invalid_args >"$tmp_dir/traversal-name.out" 2>&1; then
    fail "dot repository component was accepted: $invalid_args"
  fi
done

: > "$MOCK_GH_LOG"
: > "$MOCK_GH_STATE"
MOCK_AUDIT_DRIFT=1
export MOCK_AUDIT_DRIFT
if $script --source source/repo --new-name dest --execute \
  --confirm 'source/repo@4242->Kobbokkom/dest' >"$tmp_dir/drift.out" 2>&1; then
  fail 'security-relevant post-transfer drift was accepted'
fi
grep -q 'MISMATCH actions-variables' "$tmp_dir/drift.out" \
  || fail 'security-relevant drift mismatch was not reported'
unset MOCK_AUDIT_DRIFT

printf 'PASS: org-kobbokkom-repo-migration\n'
