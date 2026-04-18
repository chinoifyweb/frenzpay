#!/usr/bin/env bash
# 07b-restore-drill.sh — Weekly restore drill: validates latest backup restores cleanly.
# Run via cron: 0 3 * * 0 /path/to/07b-restore-drill.sh >> /var/log/frenzpay/restore-drill.log 2>&1
set -euo pipefail

BACKUP_DIR="/var/backups/frenzpay"
BACKUP_KEY_FILE="${BACKUP_KEY_FILE:-/etc/frenzpay/backup.key}"
DB_USER="${DB_USER:-frenzpay_app}"
DRILL_DB="frenzpay_restore_drill_$(date +%s)"

echo "[$(date)] Starting restore drill (DB: $DRILL_DB)..."

# Find latest backup
LATEST=$(find "$BACKUP_DIR" -name "*.sql.gz.gpg" | sort | tail -1)
if [ -z "$LATEST" ]; then
  echo "[$(date)] ERROR: No backup found in $BACKUP_DIR"
  exit 1
fi

echo "[$(date)] Restoring from: $LATEST"

# Create throwaway DB
sudo -u postgres createdb "$DRILL_DB" -O "$DB_USER"

# Decrypt → decompress → restore
gpg \
  --batch \
  --yes \
  --passphrase-file "$BACKUP_KEY_FILE" \
  --decrypt "$LATEST" \
  | gunzip \
  | PGPASSFILE=/etc/frenzpay/.pgpass \
    pg_restore \
      -U "$DB_USER" \
      -d "$DRILL_DB" \
      -h 127.0.0.1 \
      --no-password \
      --single-transaction

# Basic smoke test: count key tables
COUNTS=$(PGPASSFILE=/etc/frenzpay/.pgpass psql -U "$DB_USER" -h 127.0.0.1 -d "$DRILL_DB" -t -c "
  SELECT json_build_object(
    'users', (SELECT COUNT(*) FROM users),
    'ledger_entries', (SELECT COUNT(*) FROM ledger_entries),
    'transactions', (SELECT COUNT(*) FROM transactions)
  );
")

echo "[$(date)] Restore drill PASSED. Table counts: $COUNTS"

# Drop throwaway DB
sudo -u postgres dropdb "$DRILL_DB"

echo "[$(date)] Cleanup complete."
