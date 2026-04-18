#!/usr/bin/env bash
# FrenzPay daily backup — pg_dump the production database, upload to B2.
# Invoked by systemd timer (frenzpay-backup.timer). See Phase 8.
#
# Env expected (from /home/frenzpay/shared/.env.production):
#   DATABASE_URL          — Postgres connection string
#   B2_REMOTE             — rclone remote name, e.g. "b2:frenzpay-backups"
#
# Keeps 7 local dumps; rclone + B2 lifecycle rule handles remote retention.
set -euo pipefail

APP_DIR=/home/frenzpay
BACKUP_DIR="$APP_DIR/shared/backups"
ENV_FILE="$APP_DIR/shared/.env.production"
TS=$(date -u +%Y%m%dT%H%M%S)

log() { echo "[backup $(date -u +%H:%M:%S)] $*"; }

[[ -f "$ENV_FILE" ]] || { log "ERROR: $ENV_FILE missing"; exit 1; }

# Read DATABASE_URL without exporting the whole env
DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)
B2_REMOTE=$(grep -E '^B2_REMOTE=' "$ENV_FILE" | head -1 | cut -d= -f2- || echo "")

[[ -n "$DATABASE_URL" ]] || { log "ERROR: DATABASE_URL not set"; exit 1; }

mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/frenzpay-$TS.dump"

log "pg_dump -> $OUT"
pg_dump --format=custom --no-owner --no-acl --compress=9 -d "$DATABASE_URL" -f "$OUT"

SIZE=$(du -h "$OUT" | cut -f1)
log "dump ok ($SIZE)"

# Upload to B2 if configured
if [[ -n "$B2_REMOTE" ]] && command -v rclone >/dev/null 2>&1; then
  log "uploading to $B2_REMOTE/postgres/"
  rclone copy "$OUT" "$B2_REMOTE/postgres/" --no-traverse
else
  log "B2 upload skipped (B2_REMOTE not set or rclone missing)"
fi

# Prune local — keep last 7
cd "$BACKUP_DIR"
ls -1t frenzpay-*.dump 2>/dev/null | tail -n +8 | xargs -r rm -f

log "complete"
