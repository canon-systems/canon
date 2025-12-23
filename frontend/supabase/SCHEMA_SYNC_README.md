# Supabase Schema Sync Script

This automated script helps you synchronize your Supabase database schema from Development to Production with built-in safety checks and manual confirmation points.

## 🚀 Quick Start

```bash
# Run the sync script
./sync_schema.sh
```

## 📋 What the Script Does

### Automated Steps:
1. **Pre-flight checks**: Verifies backups exist, checks git status
2. **Pulls DEV schema**: Gets the latest schema from development
3. **Creates migration**: Generates diff between DEV and PROD
4. **Dry-run test**: Safely tests the migration
5. **Applies changes**: Pushes to production (with confirmation)
6. **Verification**: Checks that sync was successful

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
- **Review migration files** when prompted
- **Test your app** after schema changes
- **Commit migration files** to git after successful sync

## 🔍 Troubleshooting

### Script won't run?
```bash
chmod +x sync_schema.sh
```

### No backup found?
Create a backup manually (see above) or the script will tell you exactly how.

### Dry-run fails?
Review the migration file for conflicts and fix manually.

### Need to rollback?
Use your backup files in `supabase/prod/` with `pg_restore`.

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

## 📞 Support

If you encounter issues:
1. Check the error messages (they're designed to be helpful)
2. Review the migration file for conflicts
3. Check your Supabase dashboard for any issues
4. Consider rolling back from backup if needed

---

**Last Updated**: December 2024
**Script Version**: 1.0
