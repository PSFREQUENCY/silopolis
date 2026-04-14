#!/usr/bin/env bash
# SILOPOLIS — Auto-commit changed files to GitHub
# Vercel GitHub integration handles production deploys automatically on push.
# This script ONLY commits + pushes — it never calls `vercel` directly.

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="$HOME"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="/tmp/silopolis-deploy.log"
LOCK="/tmp/silopolis-deploy.lock"
STAMP="[$(date '+%Y-%m-%dT%H:%M:%SZ')]"

# ── Lock: skip if already running ───────────────────────────────────────────
if [ -f "$LOCK" ]; then
    LOCK_AGE=$(( $(date +%s) - $(stat -f %m "$LOCK" 2>/dev/null || echo 0) ))
    if [ "$LOCK_AGE" -lt 300 ]; then
        echo "$STAMP [SKIP] Another commit is running (lock age: ${LOCK_AGE}s)" >> "$LOG"
        exit 0
    fi
    rm -f "$LOCK"
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

cd "$ROOT"
echo "$STAMP ── SILOPOLIS auto-commit ──" | tee -a "$LOG"

# ── Commit + push any tracked changes ────────────────────────────────────────
CHANGED=$(git status --porcelain dashboard/ core/ api/ 2>/dev/null | wc -l | tr -d ' ')

if [ "$CHANGED" -gt "0" ]; then
    echo "$STAMP $CHANGED file(s) changed — committing..." | tee -a "$LOG"
    git add dashboard/ core/ api/ 2>&1 | tee -a "$LOG" || true
    git commit -m "auto: update $(date '+%Y-%m-%dT%H:%M')" \
        2>&1 | tee -a "$LOG" || true
    if git push origin main 2>&1 | tee -a "$LOG"; then
        echo "$STAMP Push OK — Vercel will auto-deploy from GitHub" | tee -a "$LOG"
    else
        echo "$STAMP [WARN] git push failed" | tee -a "$LOG"
    fi
else
    echo "$STAMP No tracked changes — nothing to commit" | tee -a "$LOG"
fi

echo "────────────────────────────────────────────" | tee -a "$LOG"
