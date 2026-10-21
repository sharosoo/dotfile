#!/usr/bin/env bash
# Copy the hand-written OMP setup between this repo and $HOME.
#
#   ./sync.sh capture   live -> repo (run before committing)
#   ./sync.sh restore   repo -> live (new machine)
#
# Copied, not symlinked: omp and skill managers rewrite these files in place.
# MCP header secrets are replaced with ${<SERVER>_TOKEN} placeholders on capture (the repo
# is public). Restore merges the repo's server list into the live mcp.json: live-only servers
# stay, and a live header value always wins over a repo placeholder, so real keys survive.
# Files named *.local.* (e.g. rules holding company-internal identifiers) stay on the
# machine: capture skips them and --delete leaves them alone. context7-rotate's keys live
# in ~/.env.context7 (one NAME=ctx7sk-... per line) and are never captured.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIVE="$HOME/.omp"
# Directories under ~/.omp/agent whose whole contents are hand-written config.
AGENT_DIRS=(agents managed-skills rules skills extensions context7-rotate)
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

# Repo servers override live ones, except header values the repo only has as placeholders.
merge_mcp() {
  jq -s '.[0] as $live | .[1] as $repo
    | $live * ($repo | del(.mcpServers))
    | .mcpServers = (($live.mcpServers // {}) + (($repo.mcpServers // {}) | with_entries(
        .key as $name
        | .value.headers |= (if . == null then null else with_entries(
            ($live.mcpServers[$name].headers[.key] // null) as $old
            | if (.value | test("\\$\\{")) and $old != null then .value = $old else . end) end)
        | if .value.headers == null then .value |= del(.headers) else . end)))
    | .disabledServers = (($live.disabledServers // []) + ($repo.disabledServers // []) | unique)' "$1" "$2"
}

capture() {
  mkdir -p "$REPO/agent" "$REPO/agents-skills"
  cp "$LIVE/agent/config.yml" "$REPO/agent/config.yml"
  redact_mcp "$LIVE/agent/mcp.json" >"$REPO/agent/mcp.json"
  for d in "${AGENT_DIRS[@]}"; do
    rsync -a --delete --exclude '*.local.*' "$LIVE/agent/$d/" "$REPO/agent/$d/"
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
    merge_mcp "$LIVE/agent/mcp.json" "$REPO/agent/mcp.json" >"$LIVE/agent/mcp.json.new"
    mv "$LIVE/agent/mcp.json.new" "$LIVE/agent/mcp.json"
    echo "merged repo mcp.json into $LIVE/agent/mcp.json (existing header secrets kept)"
  else
    cp "$REPO/agent/mcp.json" "$LIVE/agent/mcp.json"
    echo "mcp.json restored with \${..._TOKEN} placeholders; export them or edit the file"
  fi
  chmod 600 "$LIVE/agent/mcp.json"
  for d in "${AGENT_DIRS[@]}"; do
    rsync -a "$REPO/agent/$d/" "$LIVE/agent/$d/"
  done
  if command -v systemctl >/dev/null; then
    systemctl --user link "$LIVE/agent/context7-rotate/context7-rotate.service" >/dev/null
    systemctl --user enable context7-rotate.service
    systemctl --user restart context7-rotate.service
    [[ -f $HOME/.env.context7 ]] || echo "create ~/.env.context7 (chmod 600) with NAME=ctx7sk-... lines"
  fi
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
