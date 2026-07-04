#!/usr/bin/env bash
set -euo pipefail
# --------------------------------------------------------------
# Restore a Neon database from a backup dump.
#
# Usage:
#   DATABASE_URL="postgresql://..." ./restore.sh path/to/neon_backup_TIMESTAMP.sql.gz
#
# WARNING: This will write data into whatever database DATABASE_URL
# points to. Make sure you're pointing at the right database.
#
# Options:
#   CONFIRM=yes   - Skip interactive prompt (for CI usage)
#   SAFETY_DUMP=yes - Create a pre-restore safety dump (default: yes)
#
# Examples:
#   # Interactive restore
#   DATABASE_URL="postgresql://user:pass@host/dbname" ./restore.sh backup.sql.gz
#
#   # CI / automated restore
#   CONFIRM=yes DATABASE_URL="postgresql://..." ./restore.sh backup.sql.gz
# --------------------------------------------------------------

DUMP="${1:-}"
CONFIRM="${CONFIRM:-no}"
SAFETY_DUMP="${SAFETY_DUMP:-yes}"

# ==================== Validation ====================
if [[ -z "$DUMP" ]]; then
  echo "Usage: DATABASE_URL=... ./restore.sh <dump-file.sql.gz>"
  echo ""
  echo "Environment variables:"
  echo "  DATABASE_URL  - Target database connection string"
  echo "  CONFIRM       - Set to 'yes' to skip prompt (for CI)"
  echo "  SAFETY_DUMP   - Set to 'no' to skip pre-restore safety dump"
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "::error::DATABASE_URL is not set."
  exit 1
fi

if [[ ! -f "$DUMP" ]]; then
  echo "::error::Dump file not found: $DUMP"
  exit 1
fi

# Verify dump file is valid gzip
if ! gzip -t "$DUMP" 2>/dev/null; then
  echo "::error::Dump file is not valid gzip: $DUMP"
  echo "  The file may be corrupted or truncated."
  exit 1
fi

# Show file info
DUMP_SIZE=$(wc -c < "$DUMP" | tr -d ' ')
echo "==> Dump file: $DUMP (${DUMP_SIZE} bytes)"

# ==================== SSL enforcement ====================
if [[ "$DATABASE_URL" != *"sslmode="* ]]; then
  if [[ "$DATABASE_URL" == *"?"* ]]; then
    DATABASE_URL="${DATABASE_URL}&sslmode=require"
  else
    DATABASE_URL="${DATABASE_URL}?sslmode=require"
  fi
  echo "==> Appended sslmode=require"
fi

# Safe URL for logging (redact password)
SAFE_URL=$(echo "$DATABASE_URL" | sed -E 's#(:[^@]+)@#:***@#')
echo "==> Target database: ${SAFE_URL}"

# ==================== Confirmation ====================
if [[ "$CONFIRM" != "yes" ]]; then
  echo ""
  echo "WARNING: This will OVERWRITE the target database."
  echo "  Target: ${SAFE_URL}"
  echo "  Source: ${DUMP}"
  echo ""
  read -p "Type 'yes' to proceed: " ANSWER
  if [[ "$ANSWER" != "yes" ]]; then
    echo "Aborted."
    exit 0
  fi
fi

# ==================== Safety dump (optional) ====================
if [[ "$SAFETY_DUMP" == "yes" ]]; then
  SAFETY_FILE="pre_restore_$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
  echo "==> Creating safety backup: ${SAFETY_FILE}"
  if pg_dump "$DATABASE_URL" --format=plain --no-owner --no-acl \
    | gzip > "$SAFETY_FILE" 2>/dev/null; then
    SAFETY_SIZE=$(wc -c < "$SAFETY_FILE" | tr -d ' ')
    echo "==> Safety backup saved: ${SAFETY_FILE} (${SAFETY_SIZE} bytes)"
  else
    echo "::warning::Safety backup failed. Continuing with restore..."
    rm -f "$SAFETY_FILE" 2>/dev/null || true
  fi
fi

# ==================== Restore ====================
echo "==> Restoring from ${DUMP}..."
echo "==> This may take a while for large databases..."

if ! gunzip -c "$DUMP" | psql "$DATABASE_URL" \
    --single-transaction \
    --set ON_ERROR_STOP=on \
    --no-psqlrc \
    --quiet; then
  echo "::error::Restore FAILED. Check the output above for details."
  echo ""
  if [[ -f "${SAFETY_FILE:-}" ]]; then
    echo "A safety backup was saved before the restore attempt:"
    echo "  ${SAFETY_FILE}"
    echo ""
    echo "To restore the safety backup:"
    echo "  DATABASE_URL=\"...\" ./restore.sh ${SAFETY_FILE}"
  fi
  exit 1
fi

# ==================== Sanity check ====================
echo ""
echo "==> Running sanity check..."
TABLE_COUNT=$(psql "$DATABASE_URL" --no-psqlrc --tuples-only --quiet \
  -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null || echo "?")
echo "==> Public tables found: ${TABLE_COUNT}"

echo ""
echo "============================================"
echo "  Restore complete: ${DUMP}"
echo "============================================"
echo ""
echo "Run additional checks, e.g.:"
echo "  psql \"\$DATABASE_URL\" -c 'SELECT COUNT(*) FROM \"Visitor\";'"
