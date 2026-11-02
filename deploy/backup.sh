#!/usr/bin/env bash
# Sichert die SQLite-Datenbank von Maschenwerk. Läuft täglich um 3:30 per cron,
# vor jedem Update aus der App und jederzeit von Hand:  maschenwerk-backup

set -euo pipefail

DATA_DIR="${DATA_DIR:-/var/lib/maschenwerk}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/maschenwerk}"
KEEP_DAYS="${KEEP_DAYS:-60}"

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)

# Konsistente Kopie auch während der Dienst schreibt (SQLite-Backup-API, WAL-sicher).
if [[ -f "$DATA_DIR/data.db" ]]; then
  sqlite3 "$DATA_DIR/data.db" ".backup '$BACKUP_DIR/data-$STAMP.db'"
  gzip -f "$BACKUP_DIR/data-$STAMP.db"
  echo "Sicherung: $BACKUP_DIR/data-$STAMP.db.gz"
else
  echo "Noch keine Datenbank vorhanden — nichts zu sichern."
fi

find "$BACKUP_DIR" -type f -name 'data-*.db.gz' -mtime "+$KEEP_DAYS" -delete
