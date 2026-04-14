#!/bin/bash
# SILOPOLIS — Localtunnel launcher (for launchd)
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="/Users/funmen"
exec /opt/homebrew/bin/node /opt/homebrew/bin/npx localtunnel --port 8000 --subdomain silopolis-api
