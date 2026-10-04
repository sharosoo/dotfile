#!/bin/bash
# gateway-status.sh — read-only gateway health probe.
# Safe to run from inside the gateway session (no restart, no signal).
# Outputs: service state, PID, uptime, env-var presence, recent errors, log tail.

set -u

GATEWAY="hermes-gateway"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"

echo "=== Service State ==="
if command -v systemctl >/dev/null 2>&1; then
    systemctl --user is-active "$GATEWAY" 2>/dev/null || echo "not installed"
    systemctl --user status "$GATEWAY" --no-pager 2>/dev/null | head -3
else
    echo "systemctl not available"
fi

echo
echo "=== Process ==="
pgrep -af "$GATEWAY" | head -3 || echo "no process"

echo
echo "=== Env vars (redacted) ==="
if [ -f "$HERMES_HOME/.env" ]; then
    grep -E "^(DISCORD|TELEGRAM|SLACK|SIGNAL|WHATSAPP|TEAMS)_" "$HERMES_HOME/.env" 2>/dev/null \
        | sed 's/=\(.\{8\}\).*/=\1...REDACTED.../' \
        || echo "no platform env vars set"
else
    echo "no .env file"
fi

echo
echo "=== Recent Errors (last 20) ==="
LOG="$HERMES_HOME/logs/gateway.log"
if [ -f "$LOG" ]; then
    grep -iE "error|failed|exception|traceback" "$LOG" 2>/dev/null | tail -20 \
        || echo "(no error matches in last log lines)"
else
    echo "no gateway log at $LOG"
fi

echo
echo "=== Log Tail (last 15) ==="
if [ -f "$LOG" ]; then
    tail -15 "$LOG"
else
    echo "no gateway log at $LOG"
fi

echo
echo "=== Active Sessions ==="
if [ -f "$HERMES_HOME/state.db" ]; then
    sqlite3 "$HERMES_HOME/state.db" \
        "SELECT source, COUNT(*) FROM sessions WHERE ended_at IS NULL GROUP BY source;" \
        2>/dev/null || echo "sqlite3 not available or query failed"
else
    echo "no state.db"
fi
