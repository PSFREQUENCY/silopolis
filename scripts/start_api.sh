#!/usr/bin/env bash
# SILOPOLIS — FastAPI Server via uvicorn
# Managed by launchd with KeepAlive: true — auto-restarts on crash.
# Serves the dashboard data API on localhost:8000.

set -e

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="/Users/funmen"

ROOT="/Users/funmen/silopolis"
LOG="/tmp/silopolis-api.log"

cd "$ROOT"

# Load .env
set -o allexport
if [ -f "$ROOT/.env" ]; then
    while IFS='=' read -r key rest; do
        [[ "$key" =~ ^[[:space:]]*# ]] && continue
        [[ -z "$key" ]] && continue
        val="${rest%%#*}"
        val="${val%"${val##*[![:space:]]}"}"
        export "$key"="$val"
    done < "$ROOT/.env"
fi
set +o allexport

# Resolve Python/uvicorn
if [ -f "$ROOT/.venv/bin/uvicorn" ]; then
    UVICORN="$ROOT/.venv/bin/uvicorn"
elif [ -f "/opt/homebrew/bin/uvicorn" ]; then
    UVICORN="/opt/homebrew/bin/uvicorn"
else
    UVICORN="$(which uvicorn)"
fi

echo "[$(date '+%Y-%m-%dT%H:%M:%SZ')] SILOPOLIS API starting on :8000 (uvicorn=$UVICORN)" | tee -a "$LOG"

exec "$UVICORN" api.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --log-level info \
    --no-access-log
