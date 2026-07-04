#!/usr/bin/env bash
set -euo pipefail
# --------------------------------------------------------------
# Daily logical backup of the Neon PostgreSQL database.
#
# Required environment variables (set as GitHub Secrets):
#   DATABASE_URL   - Neon connection string
#   BACKUP_REPO    - SSH URL of the private repo for backups
#   SSH_KEY_PATH   - Absolute path to the SSH private key file
#
# Optional:
#   BACKUP_DIR      - Working directory (default: /tmp/noon-backup)
#   MAX_BACKUPS     - Number of backups to retain (default: 30)
#   PG_DUMP_RETRIES - Retry attempts for pg_dump (default: 3)
#   PUSH_RETRIES    - Retry attempts for git push (default: 3)
# --------------------------------------------------------------

# ==================== Cleanup trap ====================
BACKUP_DIR="${BACKUP_DIR:-/tmp/noon-backup}"
TEMP_DUMP=""
REPO_DIR=""

cleanup() {
  local exit_code=$?
  # Remove temp dump file
  if [[ -n "$TEMP_DUMP" && -f "$TEMP_DUMP" ]]; then
    rm -f "$TEMP_DUMP"
  fi
  # Remove local backup file
  if [[ -n "${FILE:-}" && -f "${BACKUP_DIR}/${FILE}" ]]; then
    rm -f "${BACKUP_DIR}/${FILE}"
  fi
  # Remove cloned repo on failure (keep on success for debugging)
  if [[ $exit_code -ne 0 && -n "$REPO_DIR" && -d "$REPO_DIR" ]]; then
    rm -rf "$REPO_DIR"
  fi
  exit $exit_code
}
trap cleanup EXIT

# ==================== Configuration ====================
MAX_BACKUPS="${MAX_BACKUPS:-30}"
PG_DUMP_RETRIES="${PG_DUMP_RETRIES:-3}"
PUSH_RETRIES="${PUSH_RETRIES:-3}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H%M%SZ")
FILE="neon_backup_${TIMESTAMP}.sql.gz"
SSH_KEY="${SSH_KEY_PATH:-$HOME/.ssh/id_ed25519}"

# Resolve literal ~ to $HOME (GitHub Actions env blocks don't expand ~)
if [[ "$SSH_KEY" == "~/"* ]]; then
  SSH_KEY="${HOME}${SSH_KEY:1}"
fi

# ==================== Validation ====================
missing_vars=()
[[ -z "${DATABASE_URL:-}" ]] && missing_vars+=("DATABASE_URL")
[[ -z "${BACKUP_REPO:-}" ]]  && missing_vars+=("BACKUP_REPO")

if [[ ${#missing_vars[@]} -gt 0 ]]; then
  echo "::error::Missing required env vars: ${missing_vars[*]}"
  exit 1
fi

if [[ ! -f "$SSH_KEY" ]]; then
  echo "::error::SSH key not found at '${SSH_KEY}'. Check SSH_KEY_PATH."
  exit 1
fi

if ! command -v pg_dump &>/dev/null; then
  echo "::error::pg_dump not found. PostgreSQL client not installed."
  exit 1
fi

if ! command -v gzip &>/dev/null; then
  echo "::error::gzip not found."
  exit 1
fi

# ==================== SSL enforcement ====================
# Neon REQUIRES sslmode=require. Append if missing.
if [[ "$DATABASE_URL" != *"sslmode="* ]]; then
  if [[ "$DATABASE_URL" == *"?"* ]]; then
    DATABASE_URL="${DATABASE_URL}&sslmode=require"
  else
    DATABASE_URL="${DATABASE_URL}?sslmode=require"
  fi
  echo "==> Appended sslmode=require to DATABASE_URL"
fi

# Log safe URL (password redacted)
SAFE_URL=$(echo "$DATABASE_URL" | sed -E 's#(:[^@]+)@#:***@#')
echo "==> Target: ${SAFE_URL}"

# ==================== Prepare working dir ====================
mkdir -p "$BACKUP_DIR"
TEMP_DUMP="${BACKUP_DIR}/temp_dump.sql"

# ==================== pg_dump with retries ====================
dump_success=false

for ((attempt = 1; attempt <= PG_DUMP_RETRIES; attempt++)); do
  echo "==> pg_dump attempt ${attempt}/${PG_DUMP_RETRIES}..."

  # Clean previous temp dump
  rm -f "$TEMP_DUMP"

  # Dump to temp file (stderr captured for diagnostics, not discarded)
  PG_DUMP_ERR="${BACKUP_DIR}/pg_dump_error.log"
  if pg_dump "$DATABASE_URL" \
      --format=plain \
      --no-owner \
      --no-acl \
      --verbose \
      > "$TEMP_DUMP" 2>"$PG_DUMP_ERR"; then

    # Verify dump is not empty (real Neon databases produce >1KB easily)
    if [[ -s "$TEMP_DUMP" ]]; then
      FILE_SIZE=$(wc -c < "$TEMP_DUMP" | tr -d ' ')
      if [[ "$FILE_SIZE" -gt 1024 ]]; then
        echo "==> pg_dump successful: ${FILE_SIZE} bytes raw"
        dump_success=true
        break
      else
        echo "::warning::Dump suspiciously small (${FILE_SIZE} bytes). Retrying..."
      fi
    else
      echo "::warning::Dump file is empty. Retrying..."
    fi
  else
    echo "::error::pg_dump failed on attempt ${attempt}/${PG_DUMP_RETRIES}. Real error below:"
    cat "$PG_DUMP_ERR" || true
  fi

  # Exponential backoff: 5s, 10s, 20s...
  if [[ $attempt -lt $PG_DUMP_RETRIES ]]; then
    sleep_time=$((5 * (2 ** (attempt - 1))))
    echo "==> Retrying in ${sleep_time}s..."
    sleep "$sleep_time"
  fi
done

if [[ "$dump_success" != "true" ]]; then
  echo "::error::pg_dump failed after ${PG_DUMP_RETRIES} attempts."
  exit 1
fi

# Compress the verified dump
echo "==> Compressing dump..."
gzip -c "$TEMP_DUMP" > "${BACKUP_DIR}/${FILE}"
rm -f "$TEMP_DUMP"

COMPRESSED_SIZE=$(wc -c < "${BACKUP_DIR}/${FILE}" | tr -d ' ')
echo "==> Compressed: ${FILE} (${COMPRESSED_SIZE} bytes)"

# ==================== SSH configuration ====================
export GIT_SSH_COMMAND="ssh -i ${SSH_KEY} -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes -o UserKnownHostsFile=~/.ssh/known_hosts"

# ==================== Clone backup repo ====================
echo "==> Cloning backup repo..."
REPO_DIR="${BACKUP_DIR}/repo"
rm -rf "$REPO_DIR"

# Clone with retry
clone_success=false
for ((attempt = 1; attempt <= 3; attempt++)); do
  if git clone --depth 1 "${BACKUP_REPO}" "$REPO_DIR" 2>/dev/null; then
    clone_success=true
    break
  fi
  echo "::warning::git clone failed (attempt ${attempt}/3). Retrying in $((attempt * 5))s..."
  sleep $((attempt * 5))
done

if [[ "$clone_success" != "true" ]]; then
  echo "::error::Failed to clone backup repo after 3 attempts."
  exit 1
fi

cd "$REPO_DIR"

# Configure git identity
git config user.email "backup-bot@noon.local"
git config user.name "Noon Backup Bot"

# ==================== Copy dump and commit ====================
echo "==> Copying backup into repo..."
cp "${BACKUP_DIR}/${FILE}" .

git add "${FILE}"
git commit -m "backup: ${TIMESTAMP}"

# ==================== Prune old backups ====================
echo "==> Checking backup retention (max ${MAX_BACKUPS})..."

# Use glob (not ls) for reliable, safe file enumeration
existing_backups=()
for f in neon_backup_*.sql.gz; do
  [[ -f "$f" ]] && existing_backups+=("$f")
done

# Sort in reverse order (newest first by filename/timestamp)
IFS=$'\n' sorted_backups=($(printf '%s\n' "${existing_backups[@]}" | sort -r)); unset IFS
total=${#sorted_backups[@]}

echo "==> Found ${total} backup(s) in repo."

if [[ $total -gt $MAX_BACKUPS ]]; then
  to_delete_count=$((total - MAX_BACKUPS))
  echo "==> Pruning ${to_delete_count} old backup(s)..."

  # Delete from oldest (end of sorted array) to newest
  for ((i = MAX_BACKUPS; i < total; i++)); do
    old_file="${sorted_backups[$i]}"
    echo "    Removing: ${old_file}"
    git rm --quiet --force "${old_file}" 2>/dev/null || true
  done

  git commit -m "prune: remove ${to_delete_count} old backup(s) (keeping ${MAX_BACKUPS})" || true
else
  echo "==> No pruning needed."
fi

# ==================== Push with retries ====================
echo "==> Pushing to remote..."
push_success=false

for ((attempt = 1; attempt <= PUSH_RETRIES; attempt++)); do
  if git push origin HEAD 2>/dev/null; then
    push_success=true
    break
  fi
  echo "::warning::git push failed (attempt ${attempt}/${PUSH_RETRIES})."
  if [[ $attempt -lt $PUSH_RETRIES ]]; then
    sleep_time=$((5 * (2 ** (attempt - 1))))
    echo "==> Retrying push in ${sleep_time}s..."
    sleep "$sleep_time"
  fi
done

if [[ "$push_success" != "true" ]]; then
  echo "::error::Failed to push after ${PUSH_RETRIES} attempts."
  exit 1
fi

# ==================== Done ====================
echo ""
echo "============================================"
echo "  Backup complete: ${FILE}"
echo "  Size: ${COMPRESSED_SIZE} bytes (compressed)"
echo "============================================"
