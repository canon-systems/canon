# Supabase Schema Sync Script

This automated script helps you synchronize your Supabase database schema from Development to Production with built-in safety checks and manual confirmation points.

**VITAL** 
BE SURE TO BACKUP PROD DATABASE BEFORE STARTING THIS PROCESS. RUN THE FOLLOWING COMMAND IN THE TERMINAL:

```bash
pg_dump postgresql://postgres:Bx6ydMTlg2UF0wIL2Kfu3BP7pSvlvhl3@db.gghrmzcynkrfczobuqmv.supabase.co:5432/postgres --format=custom --compress=9 --file=supabase/prod/prod_backup_20251226_085311.backup
```

## 🚀 Quick Start

```bash
# Run the sync script
./sync_schema.sh
```

## 📋 What the Script Does

### Automated Steps:
1. **Pre-flight checks**: Verifies backups exist, checks git status
2. **Pulls DEV schema**: Gets the latest schema from development (syncs local migrations with DEV)
3. **Creates migration**: Generates diff between local migrations (DEV state) and PROD
4. **Dry-run test**: Safely tests the migration
5. **Applies changes**: Pushes to production (with confirmation)
6. **Verification**: Checks that sync was successful

### Understanding the Workflow:
- **`db pull`**: Syncs your local migration files with the linked database (DEV). Creates a migration file representing the current state.
- **`db diff --linked`**: Compares your local migrations (what the DB should look like) vs the linked database (what it actually looks like). Generates a migration to make them match.
- **`db push`**: Applies your local migrations to the linked database.

### Manual Confirmation Points:
- ✅ Initial start confirmation
- ✅ Git status warning (if uncommitted changes)
- ✅ Migration file review confirmation
- ✅ Final production deployment confirmation

## 🛡️ Safety Features

- **Backup Verification**: Won't proceed without recent PROD backup
- **Dry-run Testing**: Always tests changes before applying
- **Manual Reviews**: Requires you to check migration files
- **Error Handling**: Stops on any failure with clear messages
- **Logging**: Records successful syncs to `supabase/sync_log.txt`

## 📁 File Structure

```
sync/
├── sync_schema.sh           # Main sync script
├── SCHEMA_SYNC_README.md    # This documentation
└── frontend/
    └── supabase/
        ├── migrations/      # Migration files
        └── prod/           # Production backups
```

## 🔧 Configuration

The script is pre-configured for your setup:
- **DEV Project**: `ekynewtwhgqideavmxnd`
- **PROD Project**: `gghrmzcynkrfczobuqmv`
- **Working Directory**: `/Users/johnsellers/Code/sync/frontend`

## 📝 Manual Backup (Before Sync)

Always create a fresh backup before running the sync:

```bash
cd frontend
pg_dump "postgresql://postgres:[YOUR_PROD_PASSWORD]@db.gghrmzcynkrfczobuqmv.supabase.co:5432/postgres" \
  --format=custom \
  --compress=9 \
  --file=supabase/prod/prod_backup_$(date +%Y%m%d_%H%M%S).backup
```

## 🎯 When to Run

- **Weekly**: Regular maintenance syncs
- **After schema changes**: When you've modified DEV and want to deploy to PROD
- **Before releases**: Ensure PROD schema matches your code expectations

## 🚨 Important Notes

- **Never modify PROD schema directly** - always sync from DEV
- **Always backup PROD** before running sync
- **Review migration files** when prompted - check for backwards changes or missing IF EXISTS clauses
- **Test your app** after schema changes
- **Commit migration files** to git after successful sync
- **Understand `db pull` vs `db diff`**: 
  - `db pull` creates a snapshot migration of the current database state
  - `db diff` compares your migrations vs the database and generates what needs to change
- **Migration files from `db pull` are snapshots**: They represent current state, not changes to apply
- **Use `db diff` to generate migrations for PROD**: It compares local migrations (DEV state) vs PROD and generates the needed changes

## 🔍 Troubleshooting

### Script won't run?
```bash
chmod +x sync_schema.sh
```

### No backup found?
Create a backup manually (see above) or the script will tell you exactly how.

### Migration History Mismatch?
If you see "migration history does not match local files":
```bash
# Check what migrations are applied
supabase migration list

# Repair orphaned migrations
supabase migration repair --status reverted <migration_timestamp>
```

### Constraint/Index Already Exists Error?
If you get errors like "constraint X already exists" or "index Y already exists", make your migration idempotent:

**For constraints:**
```sql
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'constraint_name' 
        AND conrelid = 'public.table_name'::regclass
    ) THEN
        ALTER TABLE "public"."table_name" DROP CONSTRAINT "constraint_name";
    END IF;
END $$;
```

**For indexes:**
```sql
CREATE INDEX IF NOT EXISTS index_name ON public.table_name USING btree (column_name);
```

**For adding constraints:**
```sql
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'constraint_name' 
        AND conrelid = 'public.table_name'::regclass
    ) THEN
        ALTER TABLE "public"."table_name" ADD CONSTRAINT "constraint_name" PRIMARY KEY USING INDEX "index_name";
    END IF;
END $$;
```

### Dry-run fails?
Review the migration file for conflicts and fix manually. Common issues:
- Constraints/indexes that already exist (use IF EXISTS/IF NOT EXISTS)
- Columns that don't exist (use IF EXISTS for DROP COLUMN)
- Tables that don't exist (use IF EXISTS for DROP TABLE)

### Migration shows backwards changes?
If `db diff` generates migrations that seem backwards (e.g., creating tables you want to drop):
- Your local migrations may not represent DEV's current state
- Run `supabase db pull --linked` while linked to DEV to sync
- Then run `db diff` while linked to PROD

### Need to rollback?
Use your backup files in `supabase/prod/` with `pg_restore`:
```bash
pg_restore -d "postgresql://postgres:[PASSWORD]@db.gghrmzcynkrfczobuqmv.supabase.co:5432/postgres" \
  --clean --if-exists \
  supabase/prod/prod_backup_TIMESTAMP.backup
```

## 📊 Monitoring

Check sync history:
```bash
cat frontend/supabase/sync_log.txt
```

View recent migrations:
```bash
ls -la frontend/supabase/migrations/
```

## 🎯 Best Practices

1. **Run during low-traffic periods**
2. **Have rollback plan ready**
3. **Test thoroughly after sync**
4. **Document any issues**
5. **Keep backups for at least 30 days**
6. **Make migrations idempotent**: Use `IF EXISTS` / `IF NOT EXISTS` to avoid errors if objects already exist
7. **Review generated migrations**: Always check what `db diff` generates before applying
8. **Keep local migrations in sync**: Run `db pull` from DEV regularly to keep local files current
9. **One migration per logical change**: Don't mix unrelated schema changes in one migration
10. **Test migrations locally first**: Apply migrations to a local Supabase instance before PROD

## 📞 Support

If you encounter issues:
1. Check the error messages (they're designed to be helpful)
2. Review the migration file for conflicts
3. Check your Supabase dashboard for any issues
4. Consider rolling back from backup if needed

## 📚 Manual Sync Process (Alternative)

If the automated script has issues, you can manually sync DEV → PROD:

```bash
cd /Users/johnsellers/Code/sync/frontend

# Step 1: Sync local migrations with DEV
supabase link --project-ref ekynewtwhgqideavmxnd
supabase db pull --linked

# Step 2: Generate migration for PROD
supabase link --project-ref gghrmzcynkrfczobuqmv
supabase db diff --linked -f sync_dev_to_prod_$(date +%Y%m%d_%H%M%S)

# Step 3: Review the generated migration file
# Make it idempotent if needed (add IF EXISTS/IF NOT EXISTS)

# Step 4: Apply to PROD
supabase db push --linked

# Step 5: Verify
supabase migration list
supabase db diff --linked  # Should show no changes
```

---

**Last Updated**: December 2024
**Script Version**: 1.1
