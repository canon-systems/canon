# Supabase Schema Sync: DEV → PROD

This guide provides a comprehensive, step-by-step process to synchronize your database schema from Development (DEV) to Production (PROD) environments while preserving data and ensuring safety.

## 📋 Prerequisites

### Required Tools
- Supabase CLI (latest version recommended)
- Access to both DEV and PROD Supabase projects
- Database passwords for both environments
- Git repository for tracking migrations

### Project Information
- **DEV Project Ref**: `ekynewtwhgqideavmxnd`
- **PROD Project Ref**: `gghrmzcynkrfczobuqmv`
- **Working Directory**: `/Users/johnsellers/Code/sync/frontend`

### Safety First
- **Always backup PROD data** before schema changes
- **Test migrations on a staging environment** first when possible
- **Use `--dry-run`** to preview changes before applying
- **Have a rollback plan** for critical schema changes

## 🚀 Complete Sync Process

### Phase 1: Prepare DEV Schema

```bash
# Navigate to your project directory
cd /Users/johnsellers/Code/sync/frontend

# 1. Link to DEV environment
supabase link --project-ref ekynewtwhgqideavmxnd

# 2. Pull the complete DEV schema (this creates the source of truth)
supabase db pull --linked

# 3. Verify the schema was pulled correctly
ls -la supabase/migrations/
# You should see a file like: 20251205015136_remote_schema.sql
```

**What this does:**
- Downloads your complete DEV database schema
- Creates migration files with tables, functions, policies, triggers, etc.
- Establishes the "source of truth" for what PROD should look like

### Phase 2: Prepare PROD Environment

```bash
# 1. Link to PROD environment (this overwrites the DEV link)
supabase link --project-ref gghrmzcynkrfczobuqmv

# 2. Verify you're connected to the right project
supabase projects list
# Look for the ● symbol next to your PROD project

# 3. Create a backup of PROD (STRONGLY RECOMMENDED)

**⚠️ NEVER skip this step before applying schema changes to production!**

### Method 1: Using pg_dump (Recommended for complete backup)
```bash
# Install PostgreSQL client if you don't have pg_dump
# On macOS: brew install postgresql

# Create backup using direct database connection
pg_dump "postgresql://postgres:YOUR_PROD_PASSWORD@db.gghrmzcynkrfczobuqmv.supabase.co:5432/postgres" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  --format=custom \
  --compress=9 \
  --file=prod_backup_$(date +%Y%m%d_%H%M%S).backup

# Alternative: Plain SQL dump (human-readable)
pg_dump "postgresql://postgres:Bx6ydMTlg2UF0wIL2Kfu3BP7pSvlvhl3@db.gghrmzcynkrfczobuqmv.supabase.co:5432/postgres" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  --format=plain \
  --file=prod_backup_$(date +%Y%m%d_%H%M%S).sql
```

### Method 2: Using Supabase Dashboard
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your PROD project (`gghrmzcynkrfczobuqmv`)
3. Navigate to **Database** → **Backups**
4. Click **Create backup** (if available on your plan)
5. Download the backup file for safekeeping

### Method 3: Using Supabase CLI (View/Restore Only)
```bash
# List available physical backups for your project
supabase backups list --project-ref gghrmzcynkrfczobuqmv

# View backup details in different formats
supabase backups list --project-ref gghrmzcynkrfczobuqmv --output json

# Note: Supabase CLI can only LIST and RESTORE backups, not CREATE them
# Backup creation must be done through the Dashboard or API
```

**CLI Limitation**: The Supabase CLI provides read-only access to backup management. You can list existing backups and restore to specific timestamps, but cannot create new backups through the CLI. Use the Dashboard method above for creating backups.

### Backup Verification
```bash
# For pg_dump backups:
# Verify backup file was created and has content
ls -lh prod_backup_*.backup prod_backup_*.sql 2>/dev/null || echo "No backup files found"

# Check file size (should be > 0 for successful backup)
du -h prod_backup_*.backup prod_backup_*.sql 2>/dev/null || echo "Backup verification failed"

# For Supabase Dashboard backups:
# Verify backup appears in the list
supabase backups list --project-ref gghrmzcynkrfczobuqmv

# Check backup status and creation time
supabase backups list --project-ref gghrmzcynkrfczobuqmv --output json | jq '.[0]' 2>/dev/null || echo "No backups found or jq not installed"
```

### Backup Restoration (if needed)

#### Option 1: Restore from pg_dump files
```bash
# To restore from custom format backup:
pg_restore --clean --if-exists --no-owner --no-privileges \
  --host=db.gghrmzcynkrfczobuqmv.supabase.co \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  prod_backup_20241205_143000.backup

# To restore from SQL dump:
psql "postgresql://postgres:Bx6ydMTlg2UF0wIL2Kfu3BP7pSvlvhl3@db.gghrmzcynkrfczobuqmv.supabase.co:5432/postgres" \
  < prod_backup_20241205_143000.sql
```

#### Option 2: Restore using Supabase CLI (Point-in-Time Recovery)
```bash
# List available backups to find restore timestamps
supabase backups list --project-ref gghrmzcynkrfczobuqmv

# Restore to a specific timestamp (replace with actual timestamp)
supabase backups restore --project-ref gghrmzcynkrfczobuqmv \
  --target-timestamp "2024-12-05T14:30:00Z"

# Note: PITR restores the entire database to that point in time
# This will overwrite current data with the backup state
```

#### Option 3: Restore from Supabase Dashboard
1. Go to **Database** → **Backups** in your PROD project
2. Select the backup you want to restore from
3. Click **Restore** and confirm
4. Wait for the restoration process to complete

**⚠️ Important**: All restoration methods will overwrite your current PROD database. Ensure you have the correct backup before proceeding.
```

### Phase 3: Generate Schema Differences

```bash
# 1. Generate diff migration (compares PROD against DEV schema)
supabase db diff --linked -f sync_dev_to_prod

# 2. Review the generated migration file
cat supabase/migrations/*sync_dev_to_prod.sql
# Check what changes will be made (CREATE, ALTER, DROP statements)

# 3. Dry run to preview changes (HIGHLY RECOMMENDED)
supabase db push --linked --dry-run
```

### Phase 4: Apply Changes to PROD

```bash
# 1. Final verification - ensure you have backups
echo "⚠️  BACKUP YOUR PROD DATA BEFORE PROCEEDING ⚠️"
read -p "Do you have a backup? (y/N): " confirm
if [[ $confirm != "y" ]]; then exit 1; fi

# 2. Apply the migration to PROD
supabase db push --linked

# 3. Verify the migration was successful
supabase db diff --linked -f verify_sync
# Should show minimal differences (like extensions)
```

### Phase 5: Post-Sync Verification

```bash
# 1. Check that automation tables exist
# You can verify this via Supabase Dashboard → SQL Editor
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'automation%'
ORDER BY table_name;

# Expected result:
# automation_rules
# automation_runs

# 2. Test basic functionality
# Verify your app can connect and perform basic operations
```

## 🔧 Troubleshooting Common Issues

### Issue: SASL Authentication Error
```
failed SASL auth (invalid SCRAM server-final-message received from server)
```

**Solutions:**
```bash
# Option 1: Use direct database connection (recommended)
supabase db pull --db-url 'postgresql://postgres:YOUR_DEV_PASSWORD@db.ekynewtwhgqideavmxnd.supabase.co:5432/postgres'
supabase db push --db-url 'postgresql://postgres:YOUR_PROD_PASSWORD@db.gghrmzcynkrfczobuqmv.supabase.co:5432/postgres'

# Option 2: Temporarily remove pooler configuration
mv supabase/.temp/pooler-url supabase/.temp/pooler-url.backup
# Run commands, then restore:
mv supabase/.temp/pooler-url.backup supabase/.temp/pooler-url
```

### Issue: Migration History Mismatch
```
The remote database's migration history does not match local files
```

**Solution:**
```bash
# Mark the problematic migration as reverted
supabase migration repair --status reverted MIGRATION_ID --linked
```

### Issue: Foreign Key Constraint Errors
```
ERROR: relation "public.table_name" does not exist
```

**Solution:**
- Ensure `workspace_repos` table exists in PROD before syncing automation tables
- Or temporarily remove foreign key constraints from migration and add them manually later

### Issue: IP Address Blocked
```
Check Supabase Dashboard → Settings → Database → Network Bans
```
Remove any blocked IP addresses for your current connection.

## 📝 Maintenance Workflow

### For Ongoing Schema Changes

When you make changes to DEV and need to sync to PROD:

```bash
# 1. Pull latest DEV schema
supabase link --project-ref ekynewtwhgqideavmxnd
supabase db pull --linked

# 2. Switch to PROD and sync
supabase link --project-ref gghrmzcynkrfczobuqmv
supabase db diff --linked -f sync_dev_to_prod_$(date +%Y%m%d)
supabase db push --linked --dry-run
supabase db push --linked
```

### Best Practices

1. **Version Control**: Commit migration files to git
2. **Naming**: Use timestamps in migration names for clarity
3. **Testing**: Always use `--dry-run` first
4. **Documentation**: Document schema changes and their purposes
5. **Backup**: Backup PROD before major changes
6. **Staging**: Test on staging environment when available

## 🎯 What Gets Synced

This process synchronizes:
- ✅ **Tables** and their structures
- ✅ **Columns** and data types
- ✅ **Primary keys** and constraints
- ✅ **Foreign keys** (if referenced tables exist)
- ✅ **Indexes** for performance
- ✅ **Row Level Security (RLS)** policies
- ✅ **Functions** and triggers
- ✅ **Views** and sequences
- ❌ **Data** (only structure, not content)

## 🚨 Critical Notes

1. **Data Safety**: This process only changes structure, not data
2. **Downtime**: Schema changes may briefly lock tables
3. **Dependencies**: Ensure dependent tables exist before adding foreign keys
4. **Testing**: Always test on non-production first
5. **Rollback**: Have a plan to rollback if issues occur

## 📞 Support

If you encounter issues:
1. Check this troubleshooting section first
2. Review Supabase CLI documentation
3. Check Supabase community forums
4. Contact Supabase support for complex issues

---

**Last Updated**: December 2024
**CLI Version**: 2.65.5