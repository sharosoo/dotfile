#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIVE="${HERMES_HOME:-$HOME/.hermes}"
SOURCE="$LIVE/hermes-agent"
PATCH="$ROOT/core-patches/omp-broker.patch"

if [[ ! -d $SOURCE/.git && ! -f $SOURCE/.git ]]; then
  echo "Install Hermes source before applying its broker integration: $SOURCE" >&2
  exit 1
fi
if git -C "$SOURCE" apply --reverse --check "$PATCH" 2>/dev/null; then
  echo "Hermes broker integration is already applied"
elif git -C "$SOURCE" apply --check "$PATCH"; then
  git -C "$SOURCE" apply "$PATCH"
  echo "Applied Hermes broker integration"
else
  echo "Hermes source differs from the recorded patch; reconcile it before starting Hermes. No reset or stash was performed." >&2
  exit 1
fi
if [[ ! -f $LIVE/omp-broker-runtime/bun.lock ]]; then
  echo "Restore omp-broker-runtime sources and lockfile before starting Hermes" >&2
  exit 1
fi
bun install --cwd "$LIVE/omp-broker-runtime" --frozen-lockfile
