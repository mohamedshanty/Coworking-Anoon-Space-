#!/usr/bin/env bash
set -euo pipefail
# --------------------------------------------------------------
# Daily logical backup of the Neon PostgreSQL database.
# Required environment variables (set as GitHub Secrets):
#   DATABASE_URL   - Neon connection string (include ?sslmode=require)
#   BACKUP_REPO    - SSH URL of the private repo that stores backups
#                     e.g. git@github.com:your-org/noon-db-backups.git
# --------------------------------------------------------------

BACKUP_DIR="${BACKUP_DIR:-/tmp/noon-backup}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H%M%SZ")
FILE="neon_backup_${TIMESTAMP}.sql.gz"

echo "==> Dumping database..."
pg_dump "${DATABASE_URL}" --format=plain --no-owner --no-acl \
  | gzip > "${BACKUP_DIR}/${FILE}"

echo "==> Cloning backup repo..."
git clone "${BACKUP_REPO}" "${BACKUP_DIR}/repo"

echo "==> Copying dump into repo..."
cp "${BACKUP_DIR}/${FILE}" "${BACKUP_DIR}/repo/"

cd "${BACKUP_DIR}/repo"
git add "${FILE}"
git -c user.email="backup-bot@noon.local" -c user.name="Noon Backup Bot" \
  commit -m "Neon backup ${TIMESTAMP}"

# Keep only the last 30 backups to avoid the repo growing forever
echo "==> Pruning old backups (keeping last 30)..."
ls -1t neon_backup_*.sql.gz | tail -n +31 | xargs -r git rm --quiet || true
git commit -m "Prune old backups" --allow-empty-message || true

git push origin main

echo "✅  Backup complete: ${FILE}"