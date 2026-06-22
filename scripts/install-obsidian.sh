#!/usr/bin/env bash
# Remove snap Obsidian (if present) and install official AppImage under ~/.local
set -euo pipefail

INSTALL_DIR="${OBSIDIAN_INSTALL_DIR:-$HOME/.local/share/obsidian}"
BIN_DIR="${HOME}/.local/bin"
APPIMAGE_NAME="Obsidian.AppImage"
VERSION="${OBSIDIAN_VERSION:-}" # empty = latest from GitHub

log() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null || die "curl required"
command -v jq >/dev/null || die "jq required (apt install jq)"

if command -v snap >/dev/null && snap list obsidian &>/dev/null; then
  log "Removing snap package obsidian (requires sudo)"
  sudo snap remove obsidian
  log "Optional: remove leftover snap data: rm -rf ~/snap/obsidian"
fi

mkdir -p "$INSTALL_DIR" "$BIN_DIR"

if [[ -z "$VERSION" ]]; then
  log "Resolving latest Obsidian release"
  VERSION="$(curl -fsSL https://api.github.com/repos/obsidianmd/obsidian-releases/releases/latest | jq -r '.tag_name' | sed 's/^v//')"
fi
[[ -n "$VERSION" && "$VERSION" != "null" ]] || die "could not resolve version"

URL="https://github.com/obsidianmd/obsidian-releases/releases/download/v${VERSION}/Obsidian-${VERSION}.AppImage"
TARGET="${INSTALL_DIR}/${APPIMAGE_NAME}"

log "Downloading Obsidian ${VERSION}"
curl -fL --retry 3 --progress-bar -o "${TARGET}.new" "$URL"
chmod +x "${TARGET}.new"
mv -f "${TARGET}.new" "$TARGET"

WRAPPER="${BIN_DIR}/obsidian"
cat >"$WRAPPER" <<EOF
#!/usr/bin/env bash
# Managed by dotfile/scripts/install-obsidian.sh
export APPIMAGE_EXTRACT_AND_RUN=1
exec "${TARGET}" --no-sandbox "\$@"
EOF
chmod +x "$WRAPPER"

APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICONS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/512x512/apps"
mkdir -p "$APPS_DIR" "$ICONS_DIR"

DESKTOP="${APPS_DIR}/obsidian.desktop"
sed "s|OBSIDIAN_EXEC_PLACEHOLDER|${WRAPPER}|g" \
  "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/desktop/obsidian.desktop" \
  >"$DESKTOP"
chmod 644 "$DESKTOP"

if [[ ! -f "${ICONS_DIR}/obsidian.png" ]]; then
  log "Extracting icon from AppImage (one-time)"
  TMPD="$(mktemp -d)"
  (cd "$TMPD" && "$TARGET" --appimage-extract >/dev/null 2>&1)
  ICON_SRC=""
  for cand in "$TMPD/squashfs-root/obsidian.png" "$TMPD/squashfs-root/usr/share/icons/hicolor/512x512/apps/obsidian.png"; do
    if [[ -f "$cand" ]]; then ICON_SRC="$cand"; break; fi
  done
  if [[ -n "$ICON_SRC" ]]; then
    cp "$ICON_SRC" "${ICONS_DIR}/obsidian.png"
  else
    curl -fsSL -o "${ICONS_DIR}/obsidian.png" \
      "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/images/icon.png" || true
  fi
  rm -rf "$TMPD"
fi

if command -v update-desktop-database >/dev/null; then
  update-desktop-database "$APPS_DIR" 2>/dev/null || true
fi

log "Desktop:   $DESKTOP"

log "Installed: $TARGET"
log "Wrapper:   $WRAPPER"
if ! echo ":$PATH:" | grep -q ":${BIN_DIR}:"; then
  log "Add to PATH: set -gx PATH ${BIN_DIR} \$PATH  (fish) or export PATH=\"${BIN_DIR}:\$PATH\""
fi

"$WRAPPER" --version 2>/dev/null || true

if command -v snap >/dev/null && snap list obsidian &>/dev/null; then
  log "WARNING: snap obsidian still installed — launcher may use /snap/bin/obsidian. Run: sudo snap remove obsidian"
fi
if command -v obsidian >/dev/null; then
  log "which obsidian -> $(command -v obsidian)"
fi
log "Done. Open vault: ~/Obsidian/main (see dotfile/docs/obsidian.md)"