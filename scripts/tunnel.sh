#!/bin/bash
# SILOPOLIS — Tunnel keep-alive
# Restarts localtunnel automatically if it dies.
# Run: bash scripts/tunnel.sh &

SUBDOMAIN="silopolis-api"
PORT=8000
CHECK_URL="http://localhost:$PORT/health"

echo "[tunnel] Starting keep-alive for https://$SUBDOMAIN.loca.lt → localhost:$PORT"

while true; do
    # Start tunnel
    echo "[tunnel] $(date): connecting..."
    npx localtunnel --port $PORT --subdomain $SUBDOMAIN &
    TUNNEL_PID=$!

    # Wait until tunnel is up
    sleep 5

    # Health check loop — restart if tunnel goes down
    while true; do
        sleep 30
        STATUS=$(curl -s --max-time 5 "https://$SUBDOMAIN.loca.lt/health" -H "Bypass-Tunnel-Reminder: true" 2>/dev/null)
        if echo "$STATUS" | grep -q '"ok":true'; then
            : # healthy
        else
            echo "[tunnel] $(date): tunnel dead (status: $STATUS) — restarting..."
            kill $TUNNEL_PID 2>/dev/null
            break
        fi
    done

    sleep 3
done
