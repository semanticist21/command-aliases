#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
fixture=$(mktemp -d "${TMPDIR:-/tmp}/toolkit-sync.XXXXXX")
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/home/.codex" "$fixture/home/.claude" "$fixture/home/.agents/doc" "$fixture/external"
printf 'keep\n' > "$fixture/external/sentinel"
mkdir -p "$fixture/codex"
ln -s "$fixture/external" "$fixture/codex/task"

run_sync() {
  HOME="$fixture/home" \
  CODEX_SKILLS_ROOT="$fixture/codex" \
  CLAUDE_SKILLS_ROOT="$fixture/claude" \
  OPENCODE_SKILLS_ROOT="$fixture/opencode" \
  "$repo_dir/scripts/toolkit-sync" "$1"
}

run_sync sync
run_sync check
test -f "$fixture/external/sentinel"
test ! -L "$fixture/codex/task"

unlink "$fixture/home/.agents/doc/AGENTS.md"
printf 'local context\n' > "$fixture/home/.agents/doc/AGENTS.md"
run_sync sync
test "$(cat "$fixture/home/.agents/doc/AGENTS.local.md")" = 'local context'
test -L "$fixture/home/.agents/doc/AGENTS.md"

# A document-slot conflict must fail before any runtime mutation.
printf 'before\n' > "$fixture/codex/VERSION"
unlink "$fixture/home/.codex/AGENTS.md"
mkdir "$fixture/home/.codex/AGENTS.md"
if run_sync sync 2>/dev/null; then echo 'expected document conflict' >&2; exit 1; fi
test "$(cat "$fixture/codex/VERSION")" = before
rmdir "$fixture/home/.codex/AGENTS.md"
ln -s "$repo_dir/agents/global/AGENTS.md" "$fixture/home/.codex/AGENTS.md"

# A copy-stage failure must not commit runtime content or markers.
if HOME="$fixture/home" CODEX_SKILLS_ROOT="$fixture/codex" CLAUDE_SKILLS_ROOT="$fixture/claude" OPENCODE_SKILLS_ROOT="$fixture/opencode" TOOLKIT_SYNC_TEST_FAIL_STAGE=1 "$repo_dir/scripts/toolkit-sync" sync 2>/dev/null; then
  echo 'expected injected staging failure' >&2; exit 1
fi
test "$(cat "$fixture/codex/VERSION")" = before

# Unsupported marker types fail before any runtime mutation.
mv "$fixture/codex/.sync-version" "$fixture/codex/.sync-version.saved"
mkdir "$fixture/codex/.sync-version"
if run_sync sync 2>/dev/null; then echo 'expected marker conflict' >&2; exit 1; fi
test "$(cat "$fixture/codex/VERSION")" = before
rmdir "$fixture/codex/.sync-version"
mv "$fixture/codex/.sync-version.saved" "$fixture/codex/.sync-version"

# Check rejects a marker link even when its target contains the right version.
printf '178\n' > "$fixture/external/current-version"
mv "$fixture/codex/.sync-version" "$fixture/codex/.sync-version.saved"
ln -s "$fixture/external/current-version" "$fixture/codex/.sync-version"
if run_sync check 2>/dev/null; then echo 'expected marker link drift' >&2; exit 1; fi
test "$(cat "$fixture/external/current-version")" = 178
unlink "$fixture/codex/.sync-version"
mv "$fixture/codex/.sync-version.saved" "$fixture/codex/.sync-version"

# Broken marker links cannot escape the runtime root.
mv "$fixture/codex/.sync-version" "$fixture/codex/.sync-version.saved"
ln -s "$fixture/external/not-created" "$fixture/codex/.sync-version"
if run_sync sync 2>/dev/null; then echo 'expected marker symlink rejection' >&2; exit 1; fi
test ! -e "$fixture/external/not-created"
test "$(cat "$fixture/codex/VERSION")" = before
unlink "$fixture/codex/.sync-version"
mv "$fixture/codex/.sync-version.saved" "$fixture/codex/.sync-version"

# A copy failure leaves no staging directory behind.
if HOME="$fixture/home" CODEX_SKILLS_ROOT="$fixture/codex" CLAUDE_SKILLS_ROOT="$fixture/claude" OPENCODE_SKILLS_ROOT="$fixture/opencode" TOOLKIT_SYNC_TEST_FAIL_COPY=1 "$repo_dir/scripts/toolkit-sync" sync 2>/dev/null; then
  echo 'expected injected copy failure' >&2; exit 1
fi
test -z "$(find "$fixture/codex" -maxdepth 1 -name '.toolkit-stage.*' -print -quit)"
test "$(cat "$fixture/codex/VERSION")" = before

# A failure after the first live swap restores the prior tree and marker.
printf 'old task\n' > "$fixture/codex/task/rollback-sentinel"
if HOME="$fixture/home" CODEX_SKILLS_ROOT="$fixture/codex" CLAUDE_SKILLS_ROOT="$fixture/claude" OPENCODE_SKILLS_ROOT="$fixture/opencode" TOOLKIT_SYNC_TEST_FAIL_COMMIT=1 "$repo_dir/scripts/toolkit-sync" sync 2>/dev/null; then
  echo 'expected injected commit failure' >&2; exit 1
fi
test "$(cat "$fixture/codex/task/rollback-sentinel")" = 'old task'
test "$(cat "$fixture/codex/VERSION")" = before

printf 'PASS: toolkit-sync\n'
