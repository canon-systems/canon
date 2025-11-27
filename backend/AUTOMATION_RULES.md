# Automation Rules System

This document describes the automation rules system for automatically generating and publishing documentation.

## Overview

Automation rules allow you to configure repositories to automatically:
- Detect changes in code
- Generate documentation
- Generate architecture diagrams
- Automatically approve and publish to knowledge bases

## Database Setup

Before using automation rules, you need to run the migrations:
1. `MIGRATION_WORKSPACE_REPOS.md` - Creates the workspace_repos table
2. `MIGRATION_USAGE_EVENTS.md` - Creates the usage_events table for tracking

## Rule Configuration

Rules are stored in the `workspace_repos.settings.automation_rules` JSONB field. Each rule has the following structure:

```json
{
  "automation_rules": [
    {
      "id": "nightly-update",
      "name": "Nightly Documentation Update",
      "enabled": true,
      "schedule": "every_night",
      "detect_changes": true,
      "generate_doc": true,
      "generate_diagram": false,
      "auto_publish": true,
      "auto_publish_new_docs": false,
      "auto_publish_max_changes": 50,
      "auto_publish_max_change_percentage": 5.0,
      "auto_publish_target": {
        "provider": "notion",
        "resource_id": "page-id-here",
        "metadata": {}
      }
    }
  ]
}
```

### Rule Fields

- **id** (string, required): Unique identifier for the rule
- **name** (string, optional): Human-readable name
- **enabled** (boolean, default: false): Whether the rule is active
- **schedule** (string, required): When to run the rule. Supported values:
  - `"every_night"` or `"daily"` - Runs at midnight UTC
  - `"every_monday"` - Runs on Mondays at midnight UTC
  - `"every_week"` - Runs once a week (Monday)
  - `"cron:0 0 * * *"` - Custom cron expression
  - `"interval:24h"` - Every 24 hours
  - `"interval:12h"` - Every 12 hours
  - `"interval:1d"` - Every day
- **detect_changes** (boolean, default: true): Whether to detect changes before generating
- **generate_doc** (boolean, default: true): Whether to generate documentation
- **generate_diagram** (boolean, default: false): Whether to generate architecture diagram
- **auto_publish** (boolean, default: false): Whether to automatically approve and publish
- **auto_publish_new_docs** (boolean, default: false): Whether to auto-publish new documents (no previous version)
- **auto_publish_max_changes** (integer, default: 50): Maximum number of changed lines for auto-approval
- **auto_publish_max_change_percentage** (float, default: 5.0): Maximum percentage of document changed for auto-approval
- **auto_publish_target** (object, optional): Where to publish automatically. Contains:
  - **provider** (string): "notion", "confluence", or "coda"
  - **resource_id** (string): Target page/doc ID
  - **metadata** (object): Additional provider-specific metadata

## Example: Setting Up a Rule

### Via API

```python
import requests

# Update repo settings with automation rule
response = requests.put(
    "https://your-api.com/api/repos/{repo_id}",
    headers={"Authorization": "Bearer YOUR_TOKEN"},
    json={
        "settings": {
            "subdir": None,
            "filters": None,
            "prompt_config": None,
            "automation_rules": [
                {
                    "id": "nightly",
                    "name": "Nightly Update",
                    "enabled": true,
                    "schedule": "every_night",
                    "detect_changes": true,
                    "generate_doc": true,
                    "generate_diagram": false,
                    "auto_publish": true,
                    "auto_publish_max_changes": 30,
                    "auto_publish_max_change_percentage": 3.0,
                    "auto_publish_target": {
                        "provider": "notion",
                        "resource_id": "your-page-id"
                    }
                }
            ]
        }
    }
)
```

### Via Database (Direct SQL)

```sql
UPDATE workspace_repos
SET settings = jsonb_set(
    COALESCE(settings, '{}'::jsonb),
    '{automation_rules}',
    '[
        {
            "id": "nightly",
            "name": "Nightly Update",
            "enabled": true,
            "schedule": "every_night",
            "detect_changes": true,
            "generate_doc": true,
            "generate_diagram": false,
            "auto_publish": true,
            "auto_publish_max_changes": 30,
            "auto_publish_max_change_percentage": 3.0,
            "auto_publish_target": {
                "provider": "notion",
                "resource_id": "your-page-id"
            }
        }
    ]'::jsonb
)
WHERE id = 'your-repo-id';
```

## Scheduled Execution

The automation system runs through **Supabase Edge Functions** triggered by `pg_cron` jobs. This keeps orchestration entirely inside Supabase:
- Cron schedules fire hourly (or at your configured cadence) and invoke the Edge Function `check-due-rules`.
- The Edge Function calls `POST /api/automation/trigger` on your backend (secured via `CRON_SECRET`).
- The backend executes the rule: detect changes, generate docs/diagrams, auto-approve/publish, and track usage.

### How It Works

1. **Scheduled Job** (Supabase cron job): Runs hourly.
   - Queries `workspace_repos` for enabled automation rules.
   - Determines which rules are due and posts to the backend trigger endpoint.

2. **Edge Function** (`check-due-rules`):
   - Receives the cron payload.
   - Calls your backend `/api/automation/trigger` endpoint using `BACKEND_URL` and optional `CRON_SECRET`.

3. **Backend Automation Endpoint** (`/api/automation/trigger`):
   - Dispatches execution logic (detect change, generate doc/diagram, publish, track usage).
   - Records results in `usage_events`.

4. **Cleanup & Monitoring**:
   - Every step logs to Supabase tables and Render logs.

See `supabase/config.toml` for the exact Edge Function + cron setup steps.

## Cron Deployment Checklist

1. **Edge Function** – Deploy `supabase/functions/check-due-rules/index.ts`, configure `BACKEND_URL` to your backend (e.g., `https://your-render-host/api`), and, if you set `CRON_SECRET` in the backend, mirror it here so the request can authenticate.
2. **pg_cron Job** – Verify the SQL from `supabase/config.toml` is running (hourly by default, `'0 * * * *'`). Adjust the expression or frequency as needed and ensure the service role key has access to `net.http_post`.
3. **Validation** – After the cron job runs, check Supabase logs to confirm the Edge Function executed and hit `POST /api/automation/run`. Query `usage_events` for recent `repo_scan_run`, `doc_generated`, `doc_auto_published`, and `push_to_kb` entries to make sure automation activity is recorded.

## Schema Parity (Keep Prod in Sync)

Because Dev is where you evolve schema/configuration, keep Production in lockstep:
1. Run any schema change (new column, index, RLS policy) against the Dev project first.
2. Export the SQL that implements that change (use Dev SQL Editor → **View Definition** or copy the ALTER statement).
3. Apply the same SQL to the Production project so both environments share the exact schema.
4. Verify with `information_schema.tables` and `information_schema.columns` in both projects after every change.

## Automatic Approval Logic

When `auto_publish` is enabled, the system checks:

1. **For new documents**: Only auto-publishes if `auto_publish_new_docs` is true
2. **For updates**: Compares with previous version and checks:
   - Total changed lines ≤ `auto_publish_max_changes`
   - Change percentage ≤ `auto_publish_max_change_percentage`

If both conditions are met, the document is:
1. Automatically approved
2. Published to the target knowledge base (if `auto_publish_target` is configured)

## Usage Tracking

All automation activities are tracked in the `usage_events` table:
- `repo_scan_run` - Repository analysis
- `doc_generated` - Documentation generation
- `diagram_generated` - Diagram generation
- `doc_approved` - Document approval
- `doc_auto_published` - Automatic publishing
- `push_to_kb` - Push to knowledge base

## Manual Execution

You can manually trigger automation rules via HTTP:

```bash
curl -X POST https://your-api.com/api/automation/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "repo_id": "repo-uuid",
    "rule_id": "rule-id",  # Optional - triggers all enabled rules if omitted
    "workspace_id": "workspace-uuid"
  }'
```

## Monitoring

Check rule execution status by querying the `automation_metadata` in repo settings:

```sql
SELECT 
    id,
    name,
    settings->'automation_rules' as rules,
    settings->'automation_metadata' as metadata
FROM workspace_repos
WHERE settings->'automation_rules' IS NOT NULL;
```

The `automation_metadata` contains:
- `last_run_at`: ISO timestamp of last execution
- `last_run_status`: "success" or error message

## Best Practices

1. **Start conservative**: Begin with `auto_publish: false` to review generated docs
2. **Set appropriate thresholds**: Adjust `auto_publish_max_changes` based on your doc size
3. **Monitor usage**: Check `usage_events` to track automation activity
4. **Test schedules**: Use `interval:1h` for testing before switching to `every_night`
5. **Use descriptive rule IDs**: Makes it easier to track which rule ran

## Troubleshooting

### Rules not running
- Check that `enabled: true` is set
- Verify the schedule format is correct
- Check cron job is configured in Vercel
- Review `automation_metadata` for last run times

### Auto-publish not working
- Verify `auto_publish: true` is set
- Check diff size is within thresholds
- Ensure OAuth connection exists for target provider
- Check `auto_publish_target` is correctly configured

### Errors in execution
- Check backend logs for detailed error messages
- Verify repository access permissions
- Ensure all required services (GitHub, LLM, etc.) are configured

