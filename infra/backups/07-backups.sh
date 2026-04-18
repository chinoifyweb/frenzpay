#!/usr/bin/env bash
# 07-backups.sh — PostgreSQL daily encrypted backups to Hetzner Storage Box
# Backups are GPG-symmetric encrypted with AES-256 before leaving the server.
set -euo pipefail

DB_NAME="${DB_NAME:-frenzpay_v3}"
DB_USER="${DB_USER:-frenzpay_app}"
BACKUP_DIR="/var/backups/frenzpay"
STORAGE_BOX_USER="${STORAGE_BOX_USER:?Set STORAGE_BOX_USER}"
STORAGE_BOX_HOST="${STORAGE_BOX_HOST:?Set STORAGE_BOX_HOST}"
STORAGE_BOX_PATH="${STORAGE_BOX_PATH:-/frenzpay/postgres}"
BACKUP_KEY_FILE="${BACKUP_KEY_FILE:-/etc/frenzpay/backup.key}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="frenzpay_${DB_NAME}_${DATE}.sql.gz.gpg"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup of $DB_NAME..."

# 1. Dump → gzip → gpg encrypt in one pipeline (never touches disk unencrypted)
PGPASSFILE=/etc/frenzpay/.pgpass \
pg_dump \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -h 127.0.0.1 \
  --format=custom \
  --no-password \
  | gzip \
  | gpg \
    --batch \
    --yes \
    --cipher-algo AES256 \
    --symmetric \
    --passphrase-file "$BACKUP_KEY_FILE" \
    --output "$BACKUP_DIR/$FILENAME"

SIZE=$(du -sh "$BACKUP_DIR/$FILENAME" | cut -f1)
echo "[$(date)] Backup created: $FILENAME ($SIZE)"

# 2. Sync to Storage Box over SSH
rsync \
  -avz \
  --delete \
  -e "ssh -i /etc/frenzpay/backup_ssh_key -o StrictHostKeyChecking=no" \
  "$BACKUP_DIR/" \
  "${STORAGE_BOX_USER}@${STORAGE_BOX_HOST}:${STORAGE_BOX_PATH}/"

echo "[$(date)] Backup synced to Storage Box."

# 3. Remove local backups older than RETENTION_DAYS
find "$BACKUP_DIR" -name "*.sql.gz.gpg" -mtime +"$RETENTION_DAYS" -delete
echo "[$(date)] Old local backups cleaned (retention: $RETENTION_DAYS days)."

echo "[$(date)] Backup complete: $FILENAME"
