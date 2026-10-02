#!/bin/bash
# Select a screen region, upload it to a GitHub repo, and copy the jsDelivr CDN link.

GITHUB_USER="${GITHUB_USER:-sharosoo}"
GITHUB_REPO="${GITHUB_REPO:-image}"
GITHUB_BRANCH="${GITHUB_BRANCH:-main}"

notify() {
  notify-send "$@"
}

for cmd in grim slurp wl-copy gh; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    notify "Screenshot Upload" "Missing command: $cmd" -u critical
    exit 1
  fi
done

# gh honours GH_TOKEN/GITHUB_TOKEN from the environment; otherwise it uses its stored login.
if ! gh auth status >/dev/null 2>&1; then
  notify "Screenshot Upload" "gh is not logged in (run: gh auth login)" -u critical
  exit 1
fi

FILENAME="screenshot_$(date +%Y%m%d_%H%M%S).png"
TEMP_FILE="$(mktemp --suffix=.png)"
JSON_FILE="$(mktemp --suffix=.json)"
trap 'rm -f "$TEMP_FILE" "$JSON_FILE"' EXIT

if ! GEOMETRY="$(slurp)" || [ -z "$GEOMETRY" ]; then
  notify "Screenshot Upload" "Screenshot cancelled" -u normal
  exit 1
fi

if ! grim -g "$GEOMETRY" "$TEMP_FILE" || [ ! -s "$TEMP_FILE" ]; then
  notify "Screenshot Upload" "Screenshot failed" -u critical
  exit 1
fi

# Stream base64 into the payload file; large images would overflow argv.
{
  printf '{"message":"Add screenshot %s","branch":"%s","content":"' "$FILENAME" "$GITHUB_BRANCH"
  base64 -w 0 "$TEMP_FILE"
  printf '"}'
} >"$JSON_FILE"

if RESPONSE="$(gh api -X PUT "repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${FILENAME}" --input "$JSON_FILE" 2>&1)"; then
  CDN_LINK="https://cdn.jsdelivr.net/gh/${GITHUB_USER}/${GITHUB_REPO}@${GITHUB_BRANCH}/${FILENAME}"
  printf '%s' "$CDN_LINK" | wl-copy
  notify "Screenshot Uploaded" "$CDN_LINK" -u normal -t 5000
  echo "$CDN_LINK"
else
  ERROR="$(printf '%s' "$RESPONSE" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)"
  notify "Screenshot Upload Failed" "${ERROR:-$RESPONSE}" -u critical
  exit 1
fi
