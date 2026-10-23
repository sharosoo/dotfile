#!/usr/bin/env bash
# Point the docker CLI at rootful Podman (see ../BTRFS.md, "Podman as Docker: NOCOW").
# Idempotent; uses sudo for the system parts. The fish and environment.d DOCKER_HOST
# files are linked by ../sync.sh; this script also covers ~/.bashrc.
set -euo pipefail

SOCK=/run/podman/podman.sock
DROPIN=/etc/systemd/system/podman.socket.d/group.conf
USER_STORE="$HOME/.local/share/containers"

# Rootful socket readable by the docker group, not only root.
want=$'[Socket]\nSocketGroup=docker\nSocketMode=0660'
if [[ ! -f $DROPIN || $(sudo cat "$DROPIN") != "$want" ]]; then
  sudo install -d -m 0755 "$(dirname "$DROPIN")"
  printf '%s\n' "$want" | sudo tee "$DROPIN" >/dev/null
  sudo systemctl daemon-reload
  echo "wrote $DROPIN"
fi

# The docker CLI sends a pids limit Podman applies literally, which blocks every fork in
# `docker run` containers; a containers.conf default overrides it.
PIDS=/etc/containers/containers.conf.d/pids.conf
want=$'[containers]\npids_limit = 4096'
if [[ ! -f $PIDS || $(sudo cat "$PIDS") != "$want" ]]; then
  sudo install -d -m 0755 "$(dirname "$PIDS")"
  printf '%s\n' "$want" | sudo tee "$PIDS" >/dev/null
  # The API service reads containers.conf at startup.
  sudo systemctl try-restart podman.service
  echo "wrote $PIDS"
fi
getent group docker >/dev/null || sudo groupadd docker
id -nG "$USER" | tr ' ' '\n' | grep -qx docker || { sudo usermod -aG docker "$USER"; echo "added $USER to docker (re-login)"; }
sudo systemctl enable --now podman.socket
# Dori's sandbox bridge needs the rootful daemon (FUSE); keep the rootless socket off.
systemctl --user disable --now podman.socket 2>/dev/null || true

# chattr +C only sticks on empty directories; never touch populated storage.
nocow() { # dir sudo-prefix...
  local dir=$1; shift
  if "$@" lsattr -d "$dir" | awk '{print $1}' | grep -q C; then return; fi
  if [[ -n $("$@" ls -A "$dir") ]]; then
    echo "skip $dir: not empty and not +C (recreate it empty to apply NOCOW)" >&2
    return
  fi
  "$@" chattr +C "$dir"
  echo "chattr +C $dir"
}
sudo test -d /var/lib/containers || sudo mkdir /var/lib/containers
nocow /var/lib/containers sudo
if [[ ! -e $USER_STORE ]]; then
  mkdir -p "$(dirname "$USER_STORE")"
  btrfs subvolume create "$USER_STORE" >/dev/null 2>&1 || mkdir "$USER_STORE"
fi
nocow "$USER_STORE" env

line="export DOCKER_HOST=unix://$SOCK"
grep -qxF "$line" "$HOME/.bashrc" 2>/dev/null || { echo "$line" >>"$HOME/.bashrc"; echo "appended DOCKER_HOST to ~/.bashrc"; }

DOCKER_HOST=unix://$SOCK docker version --format 'docker -> {{.Server.Version}}' 2>/dev/null || echo "docker CLI not reachable yet (group membership needs re-login?)" >&2
