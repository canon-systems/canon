# Database Migrations

This directory contains SQL migration files for the Supabase database.

## Migration: 20250101_migrate_to_new_tables.sql

### Purpose
This migration fixes foreign key constraints, indexes, and ensures data integrity after migrating from the old table structure to the new simple, intuitive structure.

### What This Migration Does

1. **Fixes Foreign Keys**
   - Updates `documents.repo_id` to reference `workspace_repos.id` instead of `repos.id`
   - Ensures `document_files` has proper foreign key to `documents`
   - Ensures `document_versions` has proper foreign key to `documents`
   - Updates `repository_setup.repo_id` to reference `workspace_repos.id`
   - Updates `architecture_diagrams.repo_id` to reference `workspace_repos.id`

2. **Creates Missing Indexes**
   - Indexes on `documents.repo_id` for faster lookups
   - Indexes on `document_files` for document and file path lookups
   - Indexes on `document_versions` for version queries
   - Indexes on `repository_setup.repo_id`
   - Ensures all necessary indexes exist on `repo_file_summaries`

3. **Data Integrity**
   - Removes orphaned `document_files` records (where document doesn't exist)
   - Removes orphaned `document_versions` records (where document doesn't exist)
   - Validates foreign key relationships

4. **Helper Functions**
   - Creates/updates `get_next_document_version()` function
   - Creates/updates `upsert_repo_file_summary()` function
   - Creates `update_updated_at_column()` trigger function

5. **Schema Updates**
   - Adds `updated_at` column to `documents` if missing
   - Adds `created_at` column to `documents` if missing
   - Creates trigger to auto-update `updated_at` on document updates

### How to Run

#### Option 1: Using Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy the contents of `20250101_migrate_to_new_tables.sql`
4. Paste and execute

#### Option 2: Using Supabase CLI
```bash
# If you have Supabase CLI installed
supabase db push
```

#### Option 3: Using psql
```bash
psql -h <your-db-host> -U <your-user> -d <your-database> -f 20250101_migrate_to_new_tables.sql
```

### Pre-Migration Checklist

Before running this migration, ensure:

- [ ] All code has been updated to use new tables (`documents`, `document_files`, `workspace_repos`, `repo_file_summaries`)
- [ ] You have a database backup
- [ ] You understand the changes being made
- [ ] You've tested the migration on a staging environment first

### Post-Migration Verification

After running the migration, verify:

1. **Check Foreign Keys**
   ```sql
   SELECT conname, conrelid::regclass, confrelid::regclass
   FROM pg_constraint
   WHERE contype = 'f'
   AND conrelid::regclass::text LIKE '%document%'
   ORDER BY conrelid::regclass::text;
   ```

2. **Check Indexes**
   ```sql
   SELECT indexname, tablename
   FROM pg_indexes
   WHERE schemaname = 'public'
   AND tablename IN ('documents', 'document_files', 'document_versions')
   ORDER BY tablename, indexname;
   ```

3. **Check for Orphaned Records**
   ```sql
   -- Should return 0
   SELECT COUNT(*) as orphaned_files
   FROM document_files df
   LEFT JOIN documents d ON d.id = df.document_id
   WHERE d.id IS NULL;
   
   -- Should return 0
   SELECT COUNT(*) as orphaned_versions
   FROM document_versions dv
   LEFT JOIN documents d ON d.id = dv.document_id
   WHERE d.id IS NULL;
   ```

4. **Test Application**
   - Create a new document
   - Update an existing document
   - Verify file mappings work
   - Verify version history works

### Rollback

If you need to rollback this migration:

1. **Restore from backup** (recommended)
2. **Manual rollback** (if needed):
   ```sql
   -- Drop new constraints
   ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_repo_id_workspace_repos_fkey;
   ALTER TABLE repository_setup DROP CONSTRAINT IF EXISTS repository_setup_repo_id_workspace_repos_fkey;
   ALTER TABLE architecture_diagrams DROP CONSTRAINT IF EXISTS architecture_diagrams_repo_id_workspace_repos_fkey;
   
   -- Restore old constraints (if you have the old schema)
   -- ALTER TABLE documents ADD CONSTRAINT documents_repo_id_fkey FOREIGN KEY (repo_id) REFERENCES repos(id);
   ```

### Notes

- This migration is **idempotent** - it can be run multiple times safely
- It uses `DO $$` blocks to check for existence before creating/dropping
- All destructive operations (DELETE) are clearly marked
- The migration uses transactions (BEGIN/COMMIT) for atomicity

### Troubleshooting

**Error: "constraint already exists"**
- This is safe to ignore - the migration checks for existence before creating

**Error: "column already exists"**
- This is safe to ignore - the migration checks for existence before adding

**Error: "foreign key constraint violation"**
- You may have orphaned data. Check the data integrity section of the migration
- Consider running the cleanup queries manually first

**Error: "function already exists"**
- This is safe to ignore - the migration uses `CREATE OR REPLACE`

### Support

If you encounter issues:
1. Check the Supabase logs
2. Verify your database schema matches expectations
3. Ensure you have proper permissions
4. Review the error message for specific constraint/table issues

