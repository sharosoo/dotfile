#!/usr/bin/env bash
# Install or capture the Omarchy customisations kept under omarchy/home/ (mirrors $HOME).
#
#   ./sync.sh          link: symlink every file into $HOME (differing live files are backed up)
#   ./sync.sh capture  copy the copy-managed files from $HOME back into the repo
#
# shell.json is copied, not linked: the Omarchy shell rewrites it atomically (temp file +
# rename), which would replace a symlink with a plain file and silently detach it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/home"
COPIED=(.config/omarchy/shell.json)

is_copied() {
  local rel=$1 c
  for c in "${COPIED[@]}"; do [[ $rel == "$c" ]] && return 0; done
  return 1
}

backup() {
  local dest=$1
  mv "$dest" "$dest.bak.$(date +%Y%m%d%H%M%S)"
  echo "backup $dest"
}

install_file() {
  local rel=$1 src="$ROOT/$1" dest="$HOME/$1"
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

case ${1:-link} in
link)
  while IFS= read -r -d '' f; do
    install_file "${f#"$ROOT"/}"
  done < <(find "$ROOT" -type f -print0)
  ;;
capture)
  for rel in "${COPIED[@]}"; do
    cp "$HOME/$rel" "$ROOT/$rel"
    echo "capture $rel"
  done
  ;;
*)
  echo "usage: $0 [link|capture]" >&2
  exit 1
  ;;
esac
