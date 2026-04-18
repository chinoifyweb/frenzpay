#!/usr/bin/env bash
# FrenzPay rollback — switches the `app` symlink to the previous release and
# reloads PM2. Run on the server as `frenzpay` user.
set -euo pipefail

APP_DIR=/home/frenzpay
RELEASES_DIR="$APP_DIR/releases"

log() { echo "[rollback $(date -u +%H:%M:%S)] $*"; }

CURRENT=$(readlink "$APP_DIR/app" 2>/dev/null | xargs -I{} basename "{}" || echo "")

# Find the most recent release that isn't the current one
PREVIOUS=$(ls -1t "$RELEASES_DIR" 2>/dev/null | grep -v "^${CURRENT}$" | head -n 1 || true)

if [[ -z "$PREVIOUS" ]]; then
  log "ERROR: no previous release found in $RELEASES_DIR"
  exit 1
fi

log "switching: $CURRENT -> $PREVIOUS"
ln -sfn "$RELEASES_DIR/$PREVIOUS" "$APP_DIR/app.new"
mv -Tf "$APP_DIR/app.new" "$APP_DIR/app"

pm2 reload "$APP_DIR/ecosystem.config.js" --update-env
pm2 save >/dev/null

log "waiting for health"
for i in 1 2 3 4 5; do
  if curl -fsS --max-time 5 http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    log "health ok — rolled back to $PREVIOUS"
    exit 0
  fi
  sleep 2
done

log "WARNING: rolled back but health check still failing. Investigate logs."
exit 2
