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

log "bundling native deps webpack externalised (argon2, prisma engine)"
# Next.js standalone omits modules we mark serverExternalPackages/webpack externals.
# We need them in the release's node_modules for `require()` at runtime.
STANDALONE="$RELEASE_DIR/apps/web/.next/standalone"
# Any tarball we were shipped MAY already carry .pnpm bits — scan the build-workspace
# fallback if present. In the atomic CI flow these come inside the tarball.
PNPM_SRC=""
for candidate in "$RELEASE_DIR/node_modules/.pnpm" /home/frenzpay/build-workspace/node_modules/.pnpm; do
  [[ -d "$candidate" ]] && PNPM_SRC="$candidate" && break
done

if [[ -n "$PNPM_SRC" ]]; then
  # @node-rs/argon2 + the Linux platform variant
  ARGON2_DIR=$(find "$PNPM_SRC" -maxdepth 1 -type d -name "@node-rs+argon2@*" | head -1)
  ARGON2_LINUX_DIR=$(find "$PNPM_SRC" -maxdepth 1 -type d -name "@node-rs+argon2-linux-x64-gnu@*" | head -1)

  if [[ -n "$ARGON2_DIR" && -n "$ARGON2_LINUX_DIR" ]]; then
    log "copying @node-rs/argon2 into standalone"
    mkdir -p "$STANDALONE/node_modules/.pnpm/$(basename "$ARGON2_DIR")/node_modules/@node-rs"
    rsync -aL "$ARGON2_DIR/node_modules/@node-rs/argon2/" \
      "$STANDALONE/node_modules/.pnpm/$(basename "$ARGON2_DIR")/node_modules/@node-rs/argon2/"
    mkdir -p "$STANDALONE/node_modules/.pnpm/$(basename "$ARGON2_LINUX_DIR")/node_modules/@node-rs"
    rsync -aL "$ARGON2_LINUX_DIR/node_modules/@node-rs/argon2-linux-x64-gnu/" \
      "$STANDALONE/node_modules/.pnpm/$(basename "$ARGON2_LINUX_DIR")/node_modules/@node-rs/argon2-linux-x64-gnu/"

    # Sibling symlink so argon2/index.js can resolve its platform binding
    ln -sfn "../../../$(basename "$ARGON2_LINUX_DIR")/node_modules/@node-rs/argon2-linux-x64-gnu" \
      "$STANDALONE/node_modules/.pnpm/$(basename "$ARGON2_DIR")/node_modules/@node-rs/argon2-linux-x64-gnu"

    # Top-level shim so require('@node-rs/argon2') from anywhere resolves
    mkdir -p "$STANDALONE/node_modules/@node-rs"
    ln -sfn "../.pnpm/$(basename "$ARGON2_DIR")/node_modules/@node-rs/argon2" \
      "$STANDALONE/node_modules/@node-rs/argon2"
  else
    log "WARNING: @node-rs/argon2 source not found in $PNPM_SRC — signup will fail"
  fi

  # Prisma query engine binary for Linux (also externalised from the bundle)
  PRISMA_ENGINE=$(find "$PNPM_SRC" -name "libquery_engine-debian-openssl-3.0.x.so.node" 2>/dev/null | head -1)
  PRISMA_CLIENT_SRC=$(find "$PNPM_SRC" -path "*@prisma+client*/node_modules/.prisma/client" -type d | head -1)
  if [[ -n "$PRISMA_CLIENT_SRC" ]]; then
    for dest in \
      "$STANDALONE/node_modules/.pnpm/$(basename "$(dirname "$(dirname "$(dirname "$PRISMA_CLIENT_SRC")")")")/node_modules/.prisma/client" \
      "$STANDALONE/apps/web/.prisma/client"; do
      mkdir -p "$dest"
      rsync -aL "$PRISMA_CLIENT_SRC/" "$dest/"
    done
    log "copied Prisma client + engine into standalone"
  else
    log "WARNING: .prisma/client source not found — DB calls will fail"
  fi

  # Top-level shim for @prisma/client so the cron worker's require('@prisma/client')
  # from cron.mjs resolves (Next traces it under .pnpm/... but provides no
  # top-level symlink).
  PRISMA_CLIENT_PKG_SRC=$(find "$PNPM_SRC" -maxdepth 5 -path "*@prisma+client*/node_modules/@prisma/client" -type d 2>/dev/null | head -1)
  if [[ -n "$PRISMA_CLIENT_PKG_SRC" ]]; then
    mkdir -p "$STANDALONE/node_modules/@prisma"
    rsync -aL "$PRISMA_CLIENT_PKG_SRC/" "$STANDALONE/node_modules/@prisma/client/"
    log "linked @prisma/client top-level shim for cron worker"
  else
    log "WARNING: @prisma/client package source not found — cron DB calls will fail"
  fi

  # Top-level shim for `.prisma/client` (the GENERATED client, distinct from
  # the @prisma/client package). At runtime @prisma/client does
  # `require('.prisma/client/default')` and that needs a top-level
  # `node_modules/.prisma/client` directory for the cron worker to find it.
  if [[ -n "$PRISMA_CLIENT_SRC" ]]; then
    mkdir -p "$STANDALONE/node_modules/.prisma"
    rsync -aL "$PRISMA_CLIENT_SRC/" "$STANDALONE/node_modules/.prisma/client/"
    log "linked .prisma/client top-level shim for cron worker"
  fi
fi

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

# Install the authoritative PM2 config at a stable path. PM2 remembers process
# definitions by `cwd`, so the config itself can live outside the release dir.
# This avoids the old re-export shim that broke when `infra/pm2/` moved.
if [[ -f "$RELEASE_DIR/infra/pm2/ecosystem.config.js" ]]; then
  cp "$RELEASE_DIR/infra/pm2/ecosystem.config.js" "$APP_DIR/ecosystem.config.js"
  log "refreshed $APP_DIR/ecosystem.config.js from release"
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
HEALTH_URL="http://127.0.0.1:3200/api/health"
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
