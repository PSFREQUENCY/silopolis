#!/usr/bin/env bash
# SILOPOLIS — Local heartbeat launcher
# Runs 24/7 on your Mac. No cloud needed.
# Usage: bash scripts/start_heartbeat.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."

echo "╔══════════════════════════════════════════════════╗"
echo "║         SILOPOLIS HEARTBEAT DAEMON               ║"
echo "║         3 cycles per day · X Layer               ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Activate venv if present
if [ -f "$ROOT/.venv/bin/activate" ]; then
    source "$ROOT/.venv/bin/activate"
fi

cd "$ROOT"

# Load .env
export $(grep -v '^#' .env | grep -v '^$' | xargs) 2>/dev/null || true

echo "[SILOPOLIS] Starting heartbeat daemon (interval: 8h = 3 per day)..."
echo "[SILOPOLIS] Logs: /tmp/silopolis-heartbeat.log"
echo "[SILOPOLIS] Press Ctrl+C to stop."
echo ""

python3 -m core.heartbeat --forever --interval 28800 2>&1 | tee /tmp/silopolis-heartbeat.log
