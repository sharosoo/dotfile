#!/usr/bin/env bash
# Stop herdr + every omp process, move omp SQLite DBs onto NOCOW (+C) files
# at the same paths, then leave herdr stopped. Reopening herdr resumes every
# omp pane via native session restore (omp integration v3+, resume_agents_on_restore default on).
#
# Run from anywhere (even inside herdr): it re-executes itself detached via
# systemd-run, because `herdr server stop` kills the calling pane.
set -euo pipefail
LOG="$HOME/.omp/nocow-migrate.log"

if [ "${NOCOW_DETACHED:-}" != 1 ]; then
  systemd-run --user --collect --quiet --unit="omp-nocow-migrate-$(date +%s)" \
    --setenv=NOCOW_DETACHED=1 --setenv=HOME="$HOME" --setenv=PATH="$PATH" \
    /usr/bin/env bash "$(readlink -f "$0")"
  echo "detached; log: $LOG  (herdr will close now; reopen herdr after the log says done)"
  exit 0
fi

exec >>"$LOG" 2>&1
echo "== $(date -Is) start"

# 1. Stop herdr: it saves layout + omp session refs, then its panes exit.
herdr server stop || true
for _ in $(seq 30); do pgrep -x herdr >/dev/null || break; sleep 1; done

# 2. Stop every remaining omp process (sessions, workers, broker, relay).
pkill -TERM -x omp || true
pkill -TERM -f '/oh-my-pi/[^ ]*/omp( |$)' || true
for _ in $(seq 30); do
  pgrep -x omp >/dev/null || pgrep -f '/oh-my-pi/[^ ]*/omp( |$)' >/dev/null || break
  sleep 1
done
pkill -KILL -x omp || true
pkill -KILL -f '/oh-my-pi/[^ ]*/omp( |$)' || true
sleep 1

cd "$HOME/.omp/agent"
for db in agent.db history.db models.db skill-descriptions.db; do
  [ -f "$db" ] || continue
  if fuser -s "$db" "$db-wal" 2>/dev/null; then echo "$db still open; abort"; exit 1; fi
done

# 3. New files created directly in this dir (wal/shm) inherit NOCOW.
chattr +C .

for db in agent.db history.db models.db skill-descriptions.db; do
  [ -f "$db" ] || continue
  sqlite3 "$db" 'PRAGMA wal_checkpoint(TRUNCATE);' >/dev/null
  mv "$db" "$db.cow"
  rm -f "$db-wal" "$db-shm"
  touch "$db" && chattr +C "$db"
  cat "$db.cow" > "$db"
  if [ "$(sqlite3 "$db" 'PRAGMA integrity_check;')" != ok ]; then
    echo "integrity FAILED for $db; restoring original"
    rm -f "$db"; mv "$db.cow" "$db"; exit 1
  fi
  rm -f "$db.cow"
  lsattr "$db"
done

echo "== $(date -Is) done — reopen herdr; omp panes resume automatically"
notify-send "omp NOCOW migration done" "Reopen herdr" 2>/dev/null || true
