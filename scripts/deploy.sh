#!/usr/bin/env bash
# FrenzPay deploy — atomic release, zero-downtime PM2 reload.
#
# This script runs on the server as the `frenzpay` user.
# It expects /tmp/frenzpay-release.tar.gz to exist (shipped by CI via SCP).
#
# On success: /home/frenzpay/app symlink points to the new release.
# On failure: previous release is restored via rollback.sh.
set -euo pipefail

APP_DIR=/home/frenzpay
RELEASES_DIR="$APP_DIR/releases"
SHARED_DIR="$APP_DIR/shared"
KEEP_RELEASES=5
TIMESTAMP=$(date -u +%Y%m%dT%H%M%S)
RELEASE_DIR="$RELEASES_DIR/$TIMESTAMP"
RELEASE_TARBALL=${FRENZPAY_RELEASE_TARBALL:-/tmp/frenzpay-release.tar.gz}

log() { echo "[deploy $(date -u +%H:%M:%S)] $*"; }

# Sanity checks
[[ -f "$RELEASE_TARBALL" ]] || { log "ERROR: $RELEASE_TARBALL not found"; exit 1; }
[[ -d "$RELEASES_DIR" ]] || { log "ERROR: $RELEASES_DIR missing (did you run bootstrap?)"; exit 1; }
[[ -f "$SHARED_DIR/.env.production" ]] || { log "ERROR: $SHARED_DIR/.env.production missing"; exit 1; }

log "creating release $TIMESTAMP"
mkdir -p "$RELEASE_DIR"
tar -xzf "$RELEASE_TARBALL" -C "$RELEASE_DIR"

# Standalone Next.js output ships static assets separately — fold them back in.
if [[ -d "$RELEASE_DIR/apps/web/.next/static" && -d "$RELEASE_DIR/apps/web/.next/standalone/apps/web/.next" ]]; then
  log "copying static assets into standalone output"
  cp -r "$RELEASE_DIR/apps/web/.next/static" "$RELEASE_DIR/apps/web/.next/standalone/apps/web/.next/static"
fi
if [[ -d "$RELEASE_DIR/apps/web/public" && ! -d "$RELEASE_DIR/apps/web/.next/standalone/apps/web/public" ]]; then
  log "copying public assets into standalone output"
  cp -r "$RELEASE_DIR/apps/web/public" "$RELEASE_DIR/apps/web/.next/standalone/apps/web/public"
fi

log "linking shared env file into release"
# PM2 picks up env via --env-file flag in the run command, but we also symlink
# for any process that reads dotenv directly.
ln -sfn "$SHARED_DIR/.env.production" "$RELEASE_DIR/.env.production"
ln -sfn "$SHARED_DIR/.env.production" "$RELEASE_DIR/apps/web/.env.production"
ln -sfn "$SHARED_DIR/.env.production" "$RELEASE_DIR/apps/web/.next/standalone/apps/web/.env.production" 2>/dev/null || true

# If there's a prisma binary, run migrations. This is opt-in via
# FRENZPAY_RUN_MIGRATIONS=1 to avoid surprise schema changes on every deploy.
if [[ "${FRENZPAY_RUN_MIGRATIONS:-0}" == "1" ]]; then
  log "running prisma migrate deploy"
  cd "$RELEASE_DIR"
  # `migrate deploy` only applies previously-created migrations — never generates new ones.
  if [[ -x ./node_modules/.bin/prisma ]]; then
    ./node_modules/.bin/prisma migrate deploy --schema packages/db/prisma/schema.prisma
  else
    log "WARNING: prisma CLI not bundled in release — skipping migrate"
  fi
fi

# Swap the current symlink atomically
PREVIOUS_TARGET=$(readlink "$APP_DIR/app" 2>/dev/null || echo "")
log "switching symlink: app -> $TIMESTAMP"
ln -sfn "$RELEASE_DIR" "$APP_DIR/app.new"
mv -Tf "$APP_DIR/app.new" "$APP_DIR/app"

log "reloading PM2 (zero-downtime)"
pm2 reload "$APP_DIR/ecosystem.config.js" --update-env
pm2 save >/dev/null

log "waiting for health"
HEALTH_URL="http://127.0.0.1:3000/api/health"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
    log "health ok"
    break
  fi
  if [[ $i -eq 10 ]]; then
    log "ERROR: health check did not pass after 10 tries — rolling back"
    if [[ -n "$PREVIOUS_TARGET" ]]; then
      ln -sfn "$PREVIOUS_TARGET" "$APP_DIR/app"
      pm2 reload "$APP_DIR/ecosystem.config.js" --update-env
    fi
    exit 1
  fi
  sleep 2
done

log "pruning old releases (keeping last $KEEP_RELEASES)"
cd "$RELEASES_DIR"
ls -1t | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf

log "complete: $TIMESTAMP"
