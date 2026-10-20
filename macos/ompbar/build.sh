#!/usr/bin/env bash
# Build OmpBar.app into ~/Applications and (re)start it.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$HOME/Applications/OmpBar.app"

mkdir -p "$APP/Contents/MacOS"
cp "$DIR/Info.plist" "$APP/Contents/Info.plist"
swiftc -O -swift-version 5 -parse-as-library -target arm64-apple-macos14 \
  "$DIR/OmpBar.swift" -o "$APP/Contents/MacOS/OmpBar"
codesign --force --sign - "$APP" >/dev/null

pkill -x OmpBar 2>/dev/null || true
# LaunchServices refuses to open the app (-600) while the old instance is still exiting.
for _ in 1 2 3 4 5 6 7 8 9 10; do pgrep -x OmpBar >/dev/null || break; sleep 0.3; done
open "$APP"
echo "built $APP"
