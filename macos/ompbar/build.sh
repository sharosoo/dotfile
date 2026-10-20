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
open "$APP"
echo "built $APP"
