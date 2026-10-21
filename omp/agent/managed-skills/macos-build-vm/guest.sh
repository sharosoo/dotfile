#!/bin/bash
set -euo pipefail
root=$(dirname "$(readlink -f "$0")")
port=''
while IFS=, read -r name value; do
  if [[ "$name" == ssh ]]; then port=$value; fi
done < "$root/macos-tahoe.ports"
if [[ ! "$port" =~ ^[0-9]+$ ]]; then
  printf 'No guest SSH port recorded; start the VM first.\n' >&2
  exit 1
fi
exec ssh -i "$root/access/id_ed25519" -p "$port" \
  -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$root/access/known_hosts" builder@127.0.0.1 "$@"
