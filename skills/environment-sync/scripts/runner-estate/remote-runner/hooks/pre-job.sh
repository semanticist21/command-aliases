#!/usr/bin/env bash
set -euo pipefail
exec /opt/runner-hooks/prune-cache.py \
  --root "${RUNNER_CACHE_ROOT:?RUNNER_CACHE_ROOT is required}" \
  --backing-root "${CACHE_BACKING_ROOT:?CACHE_BACKING_ROOT is required}" \
  --backing-image "${CACHE_BACKING_IMAGE:?CACHE_BACKING_IMAGE is required}" \
  --max-gb "${CACHE_MAX_GB:-400}" \
  --min-free-gb "${CACHE_MIN_FREE_GB:-100}" --enforce
