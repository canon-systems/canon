# Implementation Summary: Automation & Usage Tracking

This document summarizes the implementation of automation rules, scheduled jobs, automatic approval logic, and usage tracking.

## ✅ Completed Features

### 1. Usage Tracking System

**Files Created:**
- `backend/MIGRATION_USAGE_EVENTS.md` - Database migration for usage_events table
- `backend/app/utils/usage_tracking.py` - Utility functions for tracking events

**Events Tracked:**
- `doc_generated` - Documentation generation
- `diagram_generated` - Architecture diagram generation
- `repo_scan_run` - Repository scan/analysis
- `push_to_kb` - Push to knowledge base (Notion, Confluence, Coda)
- `doc_approved` - Document approval
- `doc_auto_published` - Automatic publishing

**Integration Points:**
- ✅ `backend/app/api/routes/repos.py` - Tracks repo scans, doc generation, diagram generation
- ✅ `backend/app/api/routes/push/notion.py` - Tracks Notion pushes
- ✅ `backend/app/api/routes/push/confluence.py` - Tracks Confluence pushes
- ✅ `backend/app/api/routes/push/coda.py` - Tracks Coda pushes
- ✅ `backend/app/api/routes/approve_doc.py` - Tracks approvals

### 2. Automation Rules System

**Files Created:**
- `backend/app/utils/automation_rules.py` - Rule parsing, scheduling, and execution logic
- `backend/AUTOMATION_RULES.md` - Complete documentation

**Features:**
- Rules stored in `workspace_repos.settings.automation_rules` JSONB field
- Support for multiple schedule types:
  - `every_night` / `daily` - Runs at midnight
  - `every_monday` - Weekly on Mondays
  - `every_week` - Weekly
  - `cron:...` - Custom cron expressions
  - `interval:24h` - Interval-based scheduling
- Rule execution tracking via `automation_metadata`

### 3. Automatic Approval Logic

**Files Created:**
- `backend/app/utils/auto_approval.py` - Auto-approval decision logic

**Features:**
- Diff size calculation (added/removed/unchanged lines)
- Configurable thresholds:
  - `auto_publish_max_changes` - Maximum changed lines (default: 50)
  - `auto_publish_max_change_percentage` - Maximum change percentage (default: 5%)
- Comparison with previous document version
- Support for auto-publishing new documents (configurable)

### 4. Scheduled Jobs

**Files Created:**
- `backend/app/api/routes/automation_job.py` - Automation job endpoint
- `frontend/src/app/api/cron/automation/route.ts` - Frontend cron proxy

**Features:**
- Hourly cron job (configurable in `vercel.json`)
- Finds all due rules across all workspaces
- Executes rules with full workflow:
  1. Detect changes (optional)
  2. Generate documentation (optional)
  3. Generate diagram (optional)
  4. Auto-approve and publish (if conditions met)
- Tracks execution results and updates last run times

**Configuration:**
- Updated `vercel.json` with new cron job: `/api/cron/automation` (runs hourly)

### 5. Integration Updates

**Updated Files:**
- `backend/app/main.py` - Added automation_job router
- `backend/app/api/routes/repos.py` - Added usage tracking
- `backend/app/api/routes/push/*.py` - Added usage tracking
- `backend/app/api/routes/approve_doc.py` - Added usage tracking

## Database Migrations Required

Before using these features, run these migrations in Supabase:

1. **Usage Events Table** (`backend/MIGRATION_USAGE_EVENTS.md`)
   - Creates `usage_events` table
   - Sets up indexes and RLS policies

2. **Workspace Repos Table** (already exists, but may need updates)
   - Ensure `settings` JSONB field exists
   - Can store `automation_rules` and `automation_metadata`

## Usage Example

### Setting Up an Automation Rule

```python
# Update repo settings
settings = {
    "automation_rules": [
        {
            "id": "nightly-update",
            "name": "Nightly Documentation Update",
            "enabled": True,
            "schedule": "every_night",
            "detect_changes": True,
            "generate_doc": True,
            "generate_diagram": False,
            "auto_publish": True,
            "auto_publish_new_docs": False,
            "auto_publish_max_changes": 50,
            "auto_publish_max_change_percentage": 5.0,
            "auto_publish_target": {
                "provider": "notion",
                "resource_id": "page-id-here"
            }
        }
    ]
}
```

### Querying Usage Events

```sql
-- Get all doc generation events for a workspace
SELECT * FROM usage_events
WHERE workspace_id = 'user-id'
  AND event_type = 'doc_generated'
ORDER BY created_at DESC;

-- Get automation activity summary
SELECT 
    event_type,
    COUNT(*) as count,
    DATE(created_at) as date
FROM usage_events
WHERE workspace_id = 'user-id'
GROUP BY event_type, DATE(created_at)
ORDER BY date DESC;
```

## API Endpoints

### Automation Job
- `POST /api/automation/run` - Manually trigger automation job (requires CRON_SECRET)

### Existing Endpoints (now with tracking)
- `POST /api/repos/{repo_id}/analyze` - Generates docs/diagrams (tracked)
- `POST /api/push/notion` - Pushes to Notion (tracked)
- `POST /api/push/confluence` - Pushes to Confluence (tracked)
- `POST /api/push/coda` - Pushes to Coda (tracked)
- `POST /api/docs/{doc_id}/approve` - Approves document (tracked)

## Environment Variables

Required for automation:
- `CRON_SECRET` - Secret for securing cron endpoints (optional but recommended)
- `BACKEND_URL` or `NEXT_PUBLIC_BACKEND_URL` - Backend API URL (for frontend cron proxy)

## Next Steps

1. **Run Database Migrations**
   - Execute SQL from `MIGRATION_USAGE_EVENTS.md`

2. **Configure Cron Secret**
   - Set `CRON_SECRET` environment variable in Vercel

3. **Set Up Rules**
   - Add automation rules to repository settings
   - Start with `enabled: false` to test

4. **Monitor Usage**
   - Query `usage_events` table to track activity
   - Review `automation_metadata` for rule execution status

5. **Test Automation**
   - Create a test rule with `schedule: "interval:1h"` for quick testing
   - Verify auto-approval thresholds work as expected
   - Check that publishing to KB works correctly

## Architecture Notes

- **Rules Storage**: Rules are stored in `workspace_repos.settings` JSONB field (no separate table needed)
- **Execution**: Rules are executed by a cron job that runs hourly
- **Tracking**: All events are logged to `usage_events` table for analytics
- **Auto-Approval**: Uses diff comparison to determine if changes are small enough
- **Publishing**: Supports Notion, Confluence, and Coda as auto-publish targets

## Testing

To test the automation system:

1. Create a test repository with a rule:
   ```json
   {
     "id": "test",
     "enabled": true,
     "schedule": "interval:1h",
     "generate_doc": true,
     "auto_publish": false
   }
   ```

2. Manually trigger the job:
   ```bash
   curl -X POST http://localhost:8000/api/automation/run \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
   ```

3. Check results:
   - Review `usage_events` table
   - Check `automation_metadata` in repo settings
   - Verify document was created in `submissions` table

