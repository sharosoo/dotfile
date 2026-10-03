#!/usr/bin/env bash
# Copy the hand-written OMP setup between this repo and $HOME.
#
#   ./sync.sh capture   live -> repo (run before committing)
#   ./sync.sh restore   repo -> live (new machine)
#
# Copied, not symlinked: omp and skill managers rewrite these files in place.
# MCP header secrets are replaced with ${<SERVER>_TOKEN} placeholders on capture (the repo
# is public); omp expands ${VAR} in mcp.json headers, so export that variable or put the
# real value back after restore.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIVE="$HOME/.omp"
# Directories under ~/.omp/agent whose whole contents are hand-written config.
AGENT_DIRS=(agents managed-skills rules skills extensions)
# Skills installed straight into ~/.agents/skills. Symlinked entries point at other repos
# or Omarchy and `synced/` is managed by the Claude app, so neither is captured.
AGENTS_SKILLS="$HOME/.agents/skills"

redact_mcp() {
  jq '(.mcpServers // {}) |= with_entries(
        .key as $name
        | if .value.headers then
            .value.headers |= with_entries(
              .value = (if (.value | test("\\$\\{")) then .value
                        else (if (.value | startswith("Bearer ")) then "Bearer " else "" end)
                             + "${" + ($name | ascii_upcase | gsub("[^A-Z0-9]"; "_")) + "_TOKEN}"
                        end))
          else . end)' "$1"
}

capture() {
  mkdir -p "$REPO/agent" "$REPO/agents-skills"
  cp "$LIVE/agent/config.yml" "$REPO/agent/config.yml"
  redact_mcp "$LIVE/agent/mcp.json" >"$REPO/agent/mcp.json"
  for d in "${AGENT_DIRS[@]}"; do
    rsync -a --delete "$LIVE/agent/$d/" "$REPO/agent/$d/"
  done
  cp "$LIVE/marketplaces.json" "$REPO/marketplaces.json"
  cp "$LIVE/plugins/installed_plugins.json" "$REPO/installed_plugins.json"

  rsync -a --delete --exclude synced \
    $(find "$AGENTS_SKILLS" -mindepth 1 -maxdepth 1 -type l -printf '--exclude %f ') \
    "$AGENTS_SKILLS/" "$REPO/agents-skills/"
  echo "captured into $REPO"
}

restore() {
  mkdir -p "$LIVE/agent" "$LIVE/plugins" "$AGENTS_SKILLS"
  cp "$REPO/agent/config.yml" "$LIVE/agent/config.yml"
  if [[ -f $LIVE/agent/mcp.json ]]; then
    echo "keep existing $LIVE/agent/mcp.json (repo copy has placeholder tokens)"
  else
    cp "$REPO/agent/mcp.json" "$LIVE/agent/mcp.json"
    echo "mcp.json restored with \${..._TOKEN} placeholders; export them or edit the file"
  fi
  for d in "${AGENT_DIRS[@]}"; do
    rsync -a "$REPO/agent/$d/" "$LIVE/agent/$d/"
  done
  cp "$REPO/marketplaces.json" "$LIVE/marketplaces.json"
  cp "$REPO/installed_plugins.json" "$LIVE/plugins/installed_plugins.json"
  rsync -a "$REPO/agents-skills/" "$AGENTS_SKILLS/"
  python3 "$REPO/cap-context.py"
  echo "restored into $LIVE and $AGENTS_SKILLS"
}

case ${1:-} in
capture) capture ;;
restore) restore ;;
*) echo "usage: $0 capture|restore" >&2; exit 1 ;;
esac
