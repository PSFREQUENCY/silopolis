#!/usr/bin/env bash
# SILOPOLIS — Install / Reload All LaunchAgents
# Run this once after any plist or script change:
#   bash /Users/funmen/silopolis/scripts/install.sh

set -e
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

ROOT="/Users/funmen/silopolis"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"

GREEN="\033[0;32m"
CYAN="\033[0;36m"
RED="\033[0;31m"
RESET="\033[0m"

echo -e "${CYAN}╔═══════════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}║     SILOPOLIS — LaunchAgent Installer         ║${RESET}"
echo -e "${CYAN}╚═══════════════════════════════════════════════╝${RESET}"
echo ""

# ── Make scripts executable ───────────────────────────────────────────────────
chmod +x "$ROOT/scripts/run_heartbeat.sh"
chmod +x "$ROOT/scripts/auto_deploy.sh"
chmod +x "$ROOT/scripts/start_heartbeat.sh"
chmod +x "$ROOT/scripts/start_tunnel.sh"
chmod +x "$ROOT/scripts/start_api.sh"
echo -e "${GREEN}✓${RESET} Scripts marked executable"

# ── Helper: unload + copy + load a plist ─────────────────────────────────────
install_plist() {
    local NAME="$1"
    local SRC="$ROOT/launchd/${NAME}.plist"
    local DST="$LAUNCH_AGENTS/${NAME}.plist"

    echo ""
    echo -e "${CYAN}── Installing ${NAME} ──${RESET}"

    # Unload existing (ignore errors if not loaded)
    launchctl unload -w "$DST" 2>/dev/null && \
        echo -e "  ${GREEN}✓${RESET} Unloaded existing" || \
        echo "  (not previously loaded)"

    # Copy updated plist
    cp "$SRC" "$DST"
    echo -e "  ${GREEN}✓${RESET} Copied to $DST"

    # Validate plist syntax
    plutil -lint "$DST" && echo -e "  ${GREEN}✓${RESET} Plist syntax OK" || {
        echo -e "  ${RED}✗ Plist syntax error — aborting${RESET}"
        exit 1
    }

    # Load and enable
    launchctl load -w "$DST"
    echo -e "  ${GREEN}✓${RESET} Loaded + enabled"
}

# ── Install all plists ────────────────────────────────────────────────────────
install_plist "com.silopolis.heartbeat"
install_plist "com.silopolis.deploy"
install_plist "com.silopolis.tunnel"
install_plist "com.silopolis.api"

# ── Status check ─────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}── LaunchAgent Status ──${RESET}"
sleep 1  # brief pause so RunAtLoad processes can start
launchctl list | grep "silopolis" | awk '{
    status = $2;
    color = (status == "0" || status == "-") ? "\033[0;32m" : "\033[0;31m";
    printf "  %s%-30s\033[0m  PID=%-6s exit=%s\n", color, $3, $1, $2
}'

echo ""
echo -e "${GREEN}All LaunchAgents installed and running.${RESET}"
echo ""
echo "  Heartbeat logs:  tail -f /tmp/silopolis-heartbeat.log"
echo "  Deploy logs:     tail -f /tmp/silopolis-deploy.log"
echo "  Tunnel logs:     tail -f /tmp/silopolis-tunnel.log"
echo "  API logs:        tail -f /tmp/silopolis-api.log"
echo ""
echo "  Force heartbeat: cd $ROOT && python3 -m core.heartbeat"
echo "  Force deploy:    bash $ROOT/scripts/auto_deploy.sh"
echo "  Force API:       bash $ROOT/scripts/start_api.sh"
