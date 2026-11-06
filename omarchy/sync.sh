#!/usr/bin/env bash
# Install or capture the Omarchy customisations kept under omarchy/home/ (mirrors $HOME).
#
#   ./sync.sh          link: symlink every file into $HOME (differing live files are backed up)
#   ./sync.sh capture  copy the copy-managed files and third-party plugins from $HOME back into the repo
#
# Some files are copied, not linked, because their owner rewrites them in a way that can
# replace a symlink with a plain file and silently detach it: the Omarchy shell saves
# shell.json atomically (temp file + rename), fcitx5 does the same for profile, fisher
# deletes and recreates fish_plugins, Zed rewrites settings.json from its settings UI, and
# herdr's config.toml is treated the same way to be safe. herdr-app rewrites its layout file
# whenever a panel is shown, hidden or switched, so layouts and keys.json are copied too. Its
# mods are copied whole (COPIED_DIRS): herdr-app refuses imports and icons whose real path
# leaves the mod folder, so neither linked files nor a linked folder load. Run
# `./sync.sh capture` after changing any of them.
#
# Third-party bar plugins are vendored under vendor/plugins/<id>/ with their source in
# vendor/plugins.lock (`id url commit`). They stay real git checkouts in $HOME so
# `omarchy plugin update` and the Spotify plugin's source verification keep working: link
# clones a missing plugin at the locked commit (falling back to the vendored copy offline),
# capture copies the tracked files back (minus docs/ and .github/) and refreshes the lock.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/home"
VENDOR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/vendor/plugins"
LIVE_PLUGINS="$HOME/.config/omarchy/plugins"
COPIED=(
  .config/omarchy/shell.json
  .config/fcitx5/profile
  .config/herdr/config.toml
  .config/herdr-core/config.toml
  .config/herdr-app/layouts/my-main.json
  .config/herdr-app/keys.json
  .config/fish/fish_plugins
  .config/zed/settings.json
)
COPIED_DIRS=(
  .config/herdr-app/mods/artifacts
  .config/herdr-app/mods/browser
  .config/herdr-app/mods/git
  .config/herdr-app/mods/my-tabs
  .config/herdr-app/mods/omp-usage
  .config/herdr-app/mods/slack
)

is_copied() {
  local rel=$1 c
  for c in "${COPIED[@]}"; do [[ $rel == "$c" ]] && return 0; done
  for c in "${COPIED_DIRS[@]}"; do [[ $rel == "$c"/* ]] && return 0; done
  return 1
}

backup() {
  local dest=$1
  mv "$dest" "$dest.bak.$(date +%Y%m%d%H%M%S)"
  echo "backup $dest"
}

install_file() {
  local rel=$1 src="$ROOT/$1" dest="$HOME/$1"
  # A directory that is itself a symlink (e.g. a plugin linked from another checkout)
  # would make us write into that other tree; replace it with a real directory.
  if [[ -L $(dirname "$dest") ]]; then rm "$(dirname "$dest")"; fi
  mkdir -p "$(dirname "$dest")"

  if is_copied "$rel"; then
    if [[ -L $dest ]]; then rm "$dest"; fi
    if [[ -e $dest ]] && ! cmp -s "$src" "$dest"; then backup "$dest"; fi
    cp "$src" "$dest"
    echo "copy $dest"
    return
  fi

  if [[ -L $dest && $(readlink "$dest") == "$src" ]]; then return; fi
  if [[ -e $dest || -L $dest ]]; then
    if [[ ! -L $dest ]] && cmp -s "$src" "$dest"; then rm "$dest"; else backup "$dest"; fi
  fi
  ln -s "$src" "$dest"
  echo "link $dest"
}

install_plugins() {
  local id url commit dest
  while read -r id url commit; do
    [[ -z $id || $id == \#* ]] && continue
    dest="$LIVE_PLUGINS/$id"
    [[ -e $dest ]] && continue
    mkdir -p "$LIVE_PLUGINS"
    if git clone -q "$url" "$dest" && git -C "$dest" checkout -q "$commit"; then
      echo "clone $dest @ $commit"
    else
      rm -rf "$dest"
      cp -r "$VENDOR/$id" "$dest"
      echo "copy $dest (vendored; clone failed)"
    fi
  done <"$VENDOR.lock"
}

capture_plugins() {
  local id src
  : >"$VENDOR.lock.tmp"
  while read -r id _; do
    [[ -z $id || $id == \#* ]] && continue
    src="$LIVE_PLUGINS/$id"
    rm -rf "${VENDOR:?}/$id"
    mkdir -p "$VENDOR/$id"
    git -C "$src" ls-files -z -- . ':!docs' ':!.github' |
      (cd "$src" && xargs -0 cp --parents -t "$VENDOR/$id")
    printf '%s %s %s\n' "$id" "$(git -C "$src" remote get-url origin)" "$(git -C "$src" rev-parse HEAD)" >>"$VENDOR.lock.tmp"
    echo "capture plugin $id"
  done <"$VENDOR.lock"
  mv "$VENDOR.lock.tmp" "$VENDOR.lock"
}

case ${1:-link} in
link)
  while IFS= read -r -d '' f; do
    install_file "${f#"$ROOT"/}"
  done < <(find "$ROOT" -type f -not -path '*/node_modules/*' -print0)
  install_plugins
  # The Artifacts panel's renderer runs from its real path here, so its packages live here (gitignored).
  (cd "$ROOT/.local/share/herdr-artifacts-render" && bun install --frozen-lockfile --silent) && echo "bun install herdr-artifacts-render"
  ;;
capture)
  for rel in "${COPIED[@]}"; do
    cp "$HOME/$rel" "$ROOT/$rel"
    echo "capture $rel"
  done
  for rel in "${COPIED_DIRS[@]}"; do
    rsync -a --delete --exclude '*.d.ts' "$HOME/$rel/" "$ROOT/$rel/"
    echo "capture $rel/"
  done
  capture_plugins
  ;;
*)
  echo "usage: $0 [link|capture]" >&2
  exit 1
  ;;
esac
