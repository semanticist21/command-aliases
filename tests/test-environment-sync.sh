#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
unrelated=$(mktemp -d "${TMPDIR:-/tmp}/environment-sync-cwd.XXXXXX")
trap 'rm -rf "$unrelated"' EXIT

if (cd "$unrelated" && sh "$repo_dir/skills/environment-sync/scripts/bootstrap.sh" invalid-action) 2>"$unrelated/error"; then
  echo 'expected invalid bootstrap action to fail' >&2
  exit 1
fi
grep -q 'usage: bootstrap.sh' "$unrelated/error"
printf 'PASS: environment-sync resolved path\n'
