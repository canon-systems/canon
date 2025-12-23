#!/bin/bash
# Supabase Schema Sync: DEV → PROD
# This script automates the sync process with manual checkpoints

set -e  # Exit on any error

# Configuration - Update these paths/refs as needed
DEV_REF="ekynewtwhgqideavmxnd"
PROD_REF="gghrmzcynkrfczobuqmv"
PROJECT_DIR="/Users/johnsellers/Code/sync/frontend"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_step() {
    echo -e "${YELLOW}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

confirm() {
    local message="$1"
    local default="${2:-no}"

    if [[ $default == "yes" ]]; then
        read -p "$message (Y/n): " -n 1 -r
        echo
        [[ ! $REPLY =~ ^[Nn]$ ]]
    else
        read -p "$message (y/N): " -n 1 -r
        echo
        [[ $REPLY =~ ^[Yy]$ ]]
    fi
}

# Pre-flight checks
preflight_checks() {
    print_header "PRE-FLIGHT CHECKS"

    # Check if we're in the right directory
    if [[ ! -d "$PROJECT_DIR/supabase" ]]; then
        print_error "Supabase directory not found at $PROJECT_DIR/supabase"
        exit 1
    fi

    # Check if git is clean (optional but recommended)
    if [[ -n $(git status --porcelain) ]]; then
        echo -e "${YELLOW}⚠️  Warning: You have uncommitted changes${NC}"
        if ! confirm "Continue anyway?"; then
            exit 0
        fi
    fi

    # Check if backup exists (look for recent backups)
    local backup_found=false
    for backup_file in "$PROJECT_DIR/supabase/prod/"prod_backup_*.backup; do
        if [[ -f "$backup_file" ]]; then
            local file_date=$(stat -f "%Sm" -t "%Y%m%d" "$backup_file" 2>/dev/null || date -r "$backup_file" +%Y%m%d 2>/dev/null)
            local today=$(date +%Y%m%d)
            # Allow backups from today or yesterday
            if [[ "$file_date" == "$today" ]] || [[ "$file_date" == "$(date -v-1d +%Y%m%d 2>/dev/null || date -d yesterday +%Y%m%d 2>/dev/null)" ]]; then
                backup_found=true
                break
            fi
        fi
    done

    if [[ "$backup_found" != true ]]; then
        print_error "No recent PROD backup found!"
        echo "Please create a backup first:"
        echo "pg_dump \"postgresql://postgres:[PASSWORD]@db.$PROD_REF.supabase.co:5432/postgres\" --format=custom --compress=9 --file=supabase/prod/prod_backup_$(date +%Y%m%d_%H%M%S).backup"
        exit 1
    fi

    print_success "Pre-flight checks passed"
}

# Main sync process
main() {
    print_header "SUPABASE SCHEMA SYNC: DEV → PROD"
    echo "DEV Project: $DEV_REF"
    echo "PROD Project: $PROD_REF"
    echo "Working Directory: $PROJECT_DIR"

    if ! confirm "Ready to start sync process?"; then
        echo "Aborted."
        exit 0
    fi

    # Change to project directory
    cd "$PROJECT_DIR"

    # Run pre-flight checks
    preflight_checks

    # Step 1: Pull latest DEV schema
    print_header "STEP 1: PULL DEV SCHEMA"
    print_step "Switching to DEV environment..."
    supabase link --project-ref "$DEV_REF"

    print_step "Pulling latest DEV schema..."
    supabase db pull --linked

    print_success "DEV schema pulled successfully"

    # Step 2: Switch to PROD and create diff
    print_header "STEP 2: ANALYZE PROD DIFFERENCES"
    print_step "Switching to PROD environment..."
    supabase link --project-ref "$PROD_REF"

    # Generate migration name with timestamp
    MIGRATION_NAME="sync_dev_to_prod_$(date +%Y%m%d_%H%M%S)"
    print_step "Creating migration: $MIGRATION_NAME"
    supabase db diff --linked -f "$MIGRATION_NAME"

    # Show what will be changed
    print_step "Reviewing changes..."
    if [[ -f "supabase/migrations/${MIGRATION_NAME}.sql" ]]; then
        echo -e "${BLUE}Migration file created: supabase/migrations/${MIGRATION_NAME}.sql${NC}"
        echo "Key changes detected:"
        grep -E "^(CREATE|ALTER|DROP)" "supabase/migrations/${MIGRATION_NAME}.sql" | head -10 || echo "No major changes detected"
    else
        print_error "Migration file was not created!"
        exit 1
    fi

    echo -e "\n${YELLOW}Please review the migration file before proceeding!${NC}"
    echo "Open: supabase/migrations/${MIGRATION_NAME}.sql"

    if ! confirm "Have you reviewed the migration file?"; then
        echo "Please review the migration file and run this script again."
        exit 0
    fi

    # Step 3: Dry run
    print_header "STEP 3: DRY RUN TEST"
    print_step "Running dry-run to test changes..."

    if supabase db push --linked --dry-run; then
        print_success "Dry-run completed successfully!"
    else
        print_error "Dry-run failed! Check the errors above."
        echo -e "${YELLOW}The migration may need manual adjustments.${NC}"
        exit 1
    fi

    # Step 4: Final confirmation and apply
    print_header "STEP 4: APPLY TO PRODUCTION"
    echo -e "${RED}⚠️  FINAL WARNING ⚠️${NC}"
    echo "This will modify your PRODUCTION database!"
    echo "Changes will be applied to: $PROD_REF"
    echo "Backup available at: supabase/prod/"

    if ! confirm "Are you absolutely sure you want to apply these changes to PRODUCTION?"; then
        echo "Aborted. Changes were NOT applied."
        exit 0
    fi

    # Apply changes
    print_step "Applying changes to production..."
    if supabase db push --linked; then
        print_success "Changes applied successfully!"

        # Step 5: Verification
        print_header "STEP 5: VERIFICATION"
        print_step "Running final diff check..."
        supabase db diff --linked > /tmp/post_sync_diff.sql

        if [[ -s /tmp/post_sync_diff.sql ]]; then
            echo -e "${YELLOW}⚠️  Some differences still exist:${NC}"
            cat /tmp/post_sync_diff.sql
        else
            print_success "Schema sync completed perfectly!"
        fi

        # Log the sync
        echo "$(date): Schema sync completed - $MIGRATION_NAME" >> supabase/sync_log.txt

        print_header "SYNC COMPLETE"
        echo "✅ DEV → PROD schema sync successful"
        echo "📝 Migration: $MIGRATION_NAME"
        echo "📅 Timestamp: $(date)"
        echo ""
        echo "Next steps:"
        echo "1. Test your application with the new schema"
        echo "2. Monitor for any issues"
        echo "3. Commit the migration file to git"

    else
        print_error "Failed to apply changes!"
        echo "Check the errors above and consider rolling back from backup if needed."
        exit 1
    fi
}

# Error handling
trap 'echo -e "\n${RED}Script interrupted!${NC}"' INT TERM

# Run main function
main "$@"
