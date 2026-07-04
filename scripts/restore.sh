#!/usr/bin/env bash
set -euo pipefail
# --------------------------------------------------------------
# Restore a Neon database from a backup dump.
#
# Usage:
#   DATABASE_URL="postgres://..." ./restore.sh path/to/neon_backup_TIMESTAMP.sql.gz
#
# WARNING: This will write data into whatever database DATABASE_URL
# points to. Make sure you're pointing at the right (usually empty
# or disposable) database before running this.
# --------------------------------------------------------------

DUMP="${1:-}"

if [[ -z "$DUMP" ]]; then
  echo "Usage: DATABASE_URL=... ./restore.sh <dump-file.sql.gz>"
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Error: DATABASE_URL environment variable is not set."
  exit 1
fi

if [[ ! -f "$DUMP" ]]; then
  echo "Error: dump file not found: $DUMP"
  exit 1
fi

echo "==> Restoring $DUMP into the target database..."
echo "==> Target: ${DATABASE_URL%%\?*}"
read -p "Are you sure you want to continue? (yes/no) " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
  echo "Aborted."
  exit 1
fi

gunzip -c "$DUMP" | psql "$DATABASE_URL"

echo "✅  Restore complete."
echo "Run a quick sanity check, e.g.: psql \"\$DATABASE_URL\" -c 'SELECT COUNT(*) FROM \"Visitor\";'"