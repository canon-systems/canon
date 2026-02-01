#!/usr/bin/env bash
# Sync Supabase schema from Dev to Prod (canon project).
# Run from repo root: ./frontend/supabase/sync_schema.sh
# Or from frontend: ./supabase/sync_schema.sh
#
# Prerequisites:
#   1. supabase login   (or set SUPABASE_ACCESS_TOKEN)
#   2. Back up Prod (see SCHEMA_SYNC_README.md) before first run

set -e

DEV_REF="ekynewtwhgqideavmxnd"
PROD_REF="gghrmzcynkrfczobuqmv"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$FRONTEND_DIR"

echo "=== Supabase schema sync: Dev -> Prod ==="
echo "Working directory: $FRONTEND_DIR"
echo ""

# Step 1: Sync local migrations with Dev
echo "Step 1: Linking to DEV and pulling schema..."
supabase link --project-ref "$DEV_REF" --yes

PULL_LOG=$(mktemp)
trap "rm -f $PULL_LOG" EXIT
run_db_pull() {
  supabase db pull --linked --yes > "$PULL_LOG" 2>&1
}
if ! run_db_pull; then
  cat "$PULL_LOG"
  if grep -q "migration history does not match" "$PULL_LOG" && grep -q "migration repair" "$PULL_LOG"; then
    echo ""
    echo "Repairing Dev migration history to match local files..."
    REPAIR_VER=$(grep -oE 'migration repair[^0-9]*[0-9]+' "$PULL_LOG" | grep -oE '[0-9]+' | head -1)
    # Use status suggested by CLI (reverted or applied); default applied if not found
    REPAIR_STATUS=$(grep -oE 'status (reverted|applied)' "$PULL_LOG" | head -1 | awk '{print $2}')
    REPAIR_STATUS=${REPAIR_STATUS:-applied}
    if [ -n "$REPAIR_VER" ]; then
      supabase migration repair --status "$REPAIR_STATUS" "$REPAIR_VER" --yes
      echo "Retrying db pull..."
      run_db_pull || true
      cat "$PULL_LOG"
      # "No schema changes found" after repair means Dev already matches local; continue to Step 2
      if ! grep -q "No schema changes found" "$PULL_LOG"; then
        echo "db pull still failed. See output above."
        exit 1
      fi
    else
      echo "Could not parse repair command. Run the suggested 'supabase migration repair ...' from the error above, then re-run this script."
      exit 1
    fi
  elif grep -q "No schema changes found" "$PULL_LOG"; then
    # Dev already matches local migrations; nothing to pull, continue to Step 2
    :
  else
    exit 1
  fi
else
  cat "$PULL_LOG"
fi

# Step 2: Generate migration for Prod
echo ""
echo "Step 2: Linking to PROD and generating migration..."
supabase link --project-ref "$PROD_REF" --yes
MIGRATION_NAME="sync_dev_to_prod_$(date +%Y%m%d_%H%M%S)"
supabase db diff --linked -f "$MIGRATION_NAME"

MIGRATION_FILE=$(ls -t supabase/migrations/*"$MIGRATION_NAME"*.sql 2>/dev/null | head -1)
if [ -z "$MIGRATION_FILE" ]; then
  echo "No migration file created. Checking for existing diff..."
  supabase db diff --linked
  echo "If there is no diff above, Dev and Prod are already in sync."
  exit 0
fi

echo ""
echo "Generated migration: $MIGRATION_FILE"
echo "Applying to PROD..."
supabase db push --linked --yes
echo ""
echo "Verifying..."
supabase migration list
supabase db diff --linked
echo "Done. Prod should match Dev."
