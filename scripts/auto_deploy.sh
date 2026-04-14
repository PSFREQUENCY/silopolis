#!/usr/bin/env bash
# SILOPOLIS — Auto Deploy to Vercel Production
# Run by launchd every 10 minutes.
# Logic:
#   1. Acquire lock — skip if another deploy is already running
#   2. If dashboard/ has uncommitted changes: commit + push to GitHub
#   3. Deploy to Vercel with retry (up to 3 attempts, 15s between retries)

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="/Users/funmen"

ROOT="/Users/funmen/silopolis"
DASHBOARD="$ROOT/dashboard"
LOG="/tmp/silopolis-deploy.log"
LOCK="/tmp/silopolis-deploy.lock"
STAMP="[$(date '+%Y-%m-%dT%H:%M:%SZ')]"

# ── Lock: prevent concurrent deploys ────────────────────────────────────────
if [ -f "$LOCK" ]; then
    LOCK_AGE=$(( $(date +%s) - $(stat -f %m "$LOCK" 2>/dev/null || echo 0) ))
    if [ "$LOCK_AGE" -lt 300 ]; then
        echo "$STAMP [SKIP] Another deploy is running (lock age: ${LOCK_AGE}s)" >> "$LOG"
        exit 0
    fi
    # Stale lock (older than 5 minutes) — remove it
    rm -f "$LOCK"
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

cd "$ROOT"
echo "$STAMP ── SILOPOLIS auto-deploy ──" | tee -a "$LOG"

# ── 1. Commit + push any dashboard changes ───────────────────────────────────
CHANGED=$(git status --porcelain dashboard/ core/ 2>/dev/null | wc -l | tr -d ' ')

if [ "$CHANGED" -gt "0" ]; then
    echo "$STAMP $CHANGED file(s) changed — committing..." | tee -a "$LOG"
    git add dashboard/ core/ 2>&1 | tee -a "$LOG" || true
    git commit -m "auto: update $(date '+%Y-%m-%dT%H:%M')" \
        2>&1 | tee -a "$LOG" || true
    git push origin main 2>&1 | tee -a "$LOG" || \
        echo "$STAMP [WARN] git push failed (will still deploy local build)" | tee -a "$LOG"
else
    echo "$STAMP No tracked changes — skipping git commit" | tee -a "$LOG"
fi

# ── 2. Deploy to Vercel with retry ──────────────────────────────────────────
cd "$DASHBOARD"
DEPLOY_OK=false

for attempt in 1 2 3; do
    echo "$STAMP Vercel deploy attempt $attempt/3..." | tee -a "$LOG"
    if /opt/homebrew/bin/vercel --prod --yes 2>&1 | tee -a "$LOG"; then
        DEPLOY_OK=true
        break
    fi
    echo "$STAMP [WARN] Attempt $attempt failed — waiting 15s before retry..." | tee -a "$LOG"
    sleep 15
done

if [ "$DEPLOY_OK" = "true" ]; then
    DEPLOY_URL=$(grep -o 'https://silopolis[^[:space:]]*vercel\.app' "$LOG" | tail -1 || true)
    echo "$STAMP Deploy SUCCESS${DEPLOY_URL:+ → $DEPLOY_URL}" | tee -a "$LOG"
else
    echo "$STAMP [ERROR] All 3 Vercel deploy attempts failed — check /tmp/silopolis-deploy.log" | tee -a "$LOG"
fi

echo "────────────────────────────────────────────" | tee -a "$LOG"
