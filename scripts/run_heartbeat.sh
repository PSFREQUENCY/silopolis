#!/usr/bin/env bash
# SILOPOLIS — Resilient Heartbeat Wrapper
# Designed for launchd with KeepAlive: true
# If the process crashes, launchd restarts it within ThrottleInterval seconds.
# Uses --forever so it self-loops at the configured interval.

set -e

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="/Users/funmen"

ROOT="/Users/funmen/silopolis"
LOG="/tmp/silopolis-heartbeat.log"
ERR="/tmp/silopolis-heartbeat.err"

# Navigate to project root (required for 'python3 -m core.heartbeat' to resolve the module)
cd "$ROOT"

# Activate venv if present (future-proofing)
if [ -f "$ROOT/.venv/bin/activate" ]; then
    source "$ROOT/.venv/bin/activate"
    PYTHON="$ROOT/.venv/bin/python3"
elif [ -f "/opt/homebrew/bin/python3" ]; then
    PYTHON="/opt/homebrew/bin/python3"
else
    PYTHON="$(which python3)"
fi

# Load .env so SILOPOLIS_HEARTBEAT_INTERVAL is available
set -o allexport
if [ -f "$ROOT/.env" ]; then
    # Parse .env, strip inline comments
    while IFS='=' read -r key rest; do
        [[ "$key" =~ ^[[:space:]]*# ]] && continue
        [[ -z "$key" ]] && continue
        val="${rest%%#*}"          # strip inline comments
        val="${val%"${val##*[![:space:]]}"}"  # rtrim
        export "$key"="$val"
    done < "$ROOT/.env"
fi
set +o allexport

INTERVAL="${SILOPOLIS_HEARTBEAT_INTERVAL:-1800}"

echo "[$(date '+%Y-%m-%dT%H:%M:%SZ')] SILOPOLIS heartbeat daemon starting" \
     "(interval=${INTERVAL}s, python=$PYTHON)" | tee -a "$LOG"

# Run forever — launchd restarts us if we crash (KeepAlive: true)
exec "$PYTHON" -m core.heartbeat --forever --interval "$INTERVAL"
