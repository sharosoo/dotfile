#!/bin/bash
set -euo pipefail
root=$(dirname "$(readlink -f "$0")")
workspace=$(dirname "$root")
tools="$workspace/host-tools"
export PATH="$tools/usr/bin:$PATH"
export LD_LIBRARY_PATH="$tools/usr/lib:$tools/usr/lib/swtpm${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
cd "$workspace"
exec "$workspace/quickemu/quickemu" --vm "$workspace/windows-11.conf" "$@"
