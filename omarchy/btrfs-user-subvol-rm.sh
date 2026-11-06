#!/usr/bin/env bash
# Toggle btrfs user_subvol_rm_allowed: persist in /etc/fstab and apply now via remount.
# Usage: btrfs-user-subvol-rm.sh [enable|disable|status]
set -euo pipefail

OPT=user_subvol_rm_allowed
FSTAB=/etc/fstab

status() {
  echo "== fstab"
  grep -E '\sbtrfs\s' "$FSTAB" | awk '{print ($4 ~ /'"$OPT"'/ ? "on " : "off"), $2}'
  echo "== mounted"
  findmnt -t btrfs -n -l -o TARGET,OPTIONS | awk '{print ($2 ~ /'"$OPT"'/ ? "on " : "off"), $1}'
}

remount_all() {
  local opt=$1
  # Mount options are shared per superblock; remounting every btrfs target keeps findmnt consistent.
  findmnt -t btrfs -n -l -o TARGET | while read -r t; do
    sudo mount -o "remount,$opt" "$t"
  done
}

case "${1:-status}" in
  enable)
    sudo cp -n "$FSTAB" "$FSTAB.bak"
    sudo sed -i -E "/\sbtrfs\s/{/$OPT/!s/(subvol=\/@[^[:space:]]*)/\1,$OPT/;}" "$FSTAB"
    sudo findmnt --verify
    sudo systemctl daemon-reload
    remount_all "$OPT"
    status
    ;;
  disable)
    sudo sed -i -E "/\sbtrfs\s/s/,$OPT//" "$FSTAB"
    sudo findmnt --verify
    remount_all "no$OPT" 2>/dev/null || echo "remount off failed; takes effect after reboot"
    status
    ;;
  status) status ;;
  *) echo "usage: $0 [enable|disable|status]" >&2; exit 2 ;;
esac
