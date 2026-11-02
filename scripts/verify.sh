#!/usr/bin/env bash
# Guitar verification gate. Browser checks are documented in docs/testing.md.
set -euo pipefail

GUITAR_REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$GUITAR_REPO_ROOT/guitar-app"

run_stage() {
  local stage="$1"
  shift
  printf 'verify: %s\n' "$stage"
  if "$@"; then
    printf 'verify: %s passed\n' "$stage"
  else
    local status=$?
    printf 'verify: %s failed (exit %s)\n' "$stage" "$status" >&2
    exit "$status"
  fi
}

run_stage unit npm test -- --runInBand --watch=false
run_stage build npm run build
printf 'verify: all stages passed (unit + build)\n'
