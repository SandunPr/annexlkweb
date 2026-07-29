#!/bin/bash

# AnnexLK Backup Automation Script for Linux VPS
# Usage: ./scripts/backup.sh

set -e

# Load environment variables
if [ -f "$(dirname "$0")/../.env" ]; then
    export $(grep -v '^#' "$(dirname "$0")/../.env" | xargs)
fi

DB_HOST=${DB_HOST:-"127.0.0.1"}
DB_NAME=${DB_NAME:-"annexlk"}
DB_USER=${DB_USER:-"root"}
DB_PASSWORD=${DB_PASSWORD:-""}

BACKUP_DIR="$(dirname "$0")/../backups"
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
ARCHIVE_NAME="annexlk-backup-$TIMESTAMP"
TARGET_DIR="$BACKUP_DIR/$ARCHIVE_NAME"

mkdir -p "$TARGET_DIR/storage"

echo "Starting backup process..."

# 1. Database dump
if [ -z "$DB_PASSWORD" ]; then
    mysqldump -h "$DB_HOST" -u "$DB_USER" "$DB_NAME" > "$TARGET_DIR/database.sql"
else
    mysqldump -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" > "$TARGET_DIR/database.sql"
fi

# 2. Copy media assets
if [ -d "$(dirname "$0")/../storage/public" ]; then
    cp -r "$(dirname "$0")/../storage/public" "$TARGET_DIR/storage/"
fi
if [ -d "$(dirname "$0")/../storage/private" ]; then
    cp -r "$(dirname "$0")/../storage/private" "$TARGET_DIR/storage/"
fi

# 3. Compress
tar -czf "$BACKUP_DIR/$ARCHIVE_NAME.tar.gz" -C "$BACKUP_DIR" "$ARCHIVE_NAME"

# Clean up folder
rm -rf "$TARGET_DIR"

echo "Backup created at: $BACKUP_DIR/$ARCHIVE_NAME.tar.gz"

# 4. Retention (keep last 7 backups)
cd "$BACKUP_DIR"
ls -t annexlk-backup-*.tar.gz | tail -n +8 | xargs -I {} rm {} || true

echo "Rolling backup retention cleanup completed."
