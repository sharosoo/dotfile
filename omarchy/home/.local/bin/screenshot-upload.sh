#!/bin/bash
# Select a screen region, upload it to cdn.sharosoo.com with the `sharosoo-cdn` CLI, and copy the link.

CDN_BIN="${CDN_BIN:-$HOME/.local/bin/sharosoo-cdn}"

notify() {
  notify-send "$@"
}

for cmd in grim slurp wl-copy "$CDN_BIN"; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    notify "Screenshot Upload" "Missing command: $cmd" -u critical
    exit 1
  fi
done

KEY="screenshots/$(date +%Y/%m)/screenshot_$(date +%Y%m%d_%H%M%S).png"
TEMP_FILE="$(mktemp --suffix=.png)"
trap 'rm -f "$TEMP_FILE"' EXIT

if ! GEOMETRY="$(slurp)" || [ -z "$GEOMETRY" ]; then
  notify "Screenshot Upload" "Screenshot cancelled" -u normal
  exit 1
fi

if ! grim -g "$GEOMETRY" "$TEMP_FILE" || [ ! -s "$TEMP_FILE" ]; then
  notify "Screenshot Upload" "Screenshot failed" -u critical
  exit 1
fi

if OUTPUT="$("$CDN_BIN" put "$TEMP_FILE" --key "$KEY" 2>&1)"; then
  CDN_LINK="$OUTPUT"
  printf '%s' "$CDN_LINK" | wl-copy
  notify "Screenshot Uploaded" "$CDN_LINK" -u normal -t 5000
  echo "$CDN_LINK"
else
  notify "Screenshot Upload Failed" "$OUTPUT" -u critical
  exit 1
fi
