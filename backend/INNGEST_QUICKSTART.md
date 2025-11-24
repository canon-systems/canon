# Inngest Quick Start Guide

This is a quick reference for getting Inngest up and running with your automation system.

## Prerequisites

- Python 3.8+
- An Inngest account ([sign up here](https://www.inngest.com))

## Step-by-Step Setup

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

This installs `inngest==0.3.0`.

### 2. Get Inngest Credentials

1. Go to [Inngest Dashboard](https://app.inngest.com)
2. Create a new app (e.g., "sync-automation")
3. Copy your **Event Key** from the app settings

### 3. Set Environment Variables

Create or update your `.env` file:

```bash
# Inngest Configuration
INNGEST_EVENT_KEY=your_event_key_here
INNGEST_SIGNING_KEY=your_signing_key_here  # Optional but recommended

# Environment
ENVIRONMENT=development  # or "production"
```

### 4. Install Inngest Dev Server (Local Development)

```bash
# Option 1: Using npm
npm install -g inngest

# Option 2: Using Homebrew (macOS)
brew install inngest/tap/inngest

# Option 3: Download binary
# Visit https://www.inngest.com/docs/local-development
```

### 5. Start Inngest Dev Server

In a separate terminal:

```bash
inngest dev
```

This starts:
- Inngest dev server at `http://localhost:8288`
- Dashboard at `http://localhost:8288/debug`

### 6. Start Your Backend

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

Your backend will:
- Register functions with Inngest on startup
- Expose serve endpoint at `/api/inngest`
- Be accessible to Inngest at `http://localhost:8000`

### 7. Verify Setup

1. **Check Inngest Dashboard**: Open `http://localhost:8288/debug`
2. **Look for Functions**: You should see:
   - `check-due-rules` (runs hourly)
   - `execute-automation-rule` (event-triggered)
   - `manual-rule-trigger` (HTTP-triggered)

3. **Test Manual Trigger**:
   ```bash
   curl -X POST http://localhost:8000/api/automation/trigger \
     -H "Content-Type: application/json" \
     -d '{
       "repo_id": "your-repo-id",
       "workspace_id": "your-workspace-id"
     }'
   ```

## How It Works

### Function Flow

```
┌─────────────────────────────────────┐
│  check-due-rules (Hourly Cron)      │
│  - Finds repos with due rules       │
│  - Sends execute-rule events        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  execute-automation-rule (Event)    │
│  - Executes the rule                │
│  - Generates docs/diagrams          │
│  - Auto-approves if configured      │
│  - Publishes to KB if configured    │
└─────────────────────────────────────┘
```

### Scheduled Execution

The `check-due-rules` function runs every hour and:
1. Queries database for repos with enabled automation rules
2. Checks if rules are due to run (based on schedule)
3. Sends `automation/execute-rule` events for each due rule

### Event-Driven Execution

The `execute-automation-rule` function:
1. Receives event with repo_id, rule_id, workspace_id
2. Fetches repo and rule configuration
3. Executes the rule (detect changes, generate doc, etc.)
4. Updates last run time on success
5. Sends completion/failure events

## Production Deployment

### 1. Set Production Environment Variables

In your production environment (Vercel, Railway, etc.):

```bash
INNGEST_EVENT_KEY=your_production_event_key
INNGEST_SIGNING_KEY=your_production_signing_key
ENVIRONMENT=production
```

### 2. Deploy Your Backend

Ensure your backend is:
- Accessible from the internet
- Has the `/api/inngest` endpoint accessible
- Has environment variables set

### 3. Inngest Cloud Discovery

Inngest Cloud will:
- Automatically discover your functions
- Start executing scheduled functions
- Process events sent to your app

### 4. Monitor in Dashboard

Visit [Inngest Dashboard](https://app.inngest.com) to:
- View function executions
- See logs and errors
- Monitor event history
- Debug issues

## Common Tasks

### Manually Trigger a Rule

```bash
curl -X POST https://your-api.com/api/automation/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "repo_id": "repo-uuid",
    "rule_id": "rule-id",
    "workspace_id": "workspace-uuid"
  }'
```

### Send a Test Event

```python
from app.core.inngest import inngest_client, AutomationEvents
import inngest

# Send test event
await inngest_client.send_sync(
    inngest.Event(
        name=AutomationEvents.EXECUTE_RULE,
        data={
            "repo_id": "test-repo-id",
            "rule_id": "test-rule-id",
            "workspace_id": "test-workspace-id"
        }
    )
)
```

### View Function Logs

1. Open Inngest dashboard
2. Navigate to Functions
3. Click on a function to see execution history
4. Click on an execution to see logs and details

## Troubleshooting

### Functions Not Appearing

- ✅ Check backend is running and accessible
- ✅ Verify `INNGEST_EVENT_KEY` is set correctly
- ✅ Check backend logs for registration errors
- ✅ Ensure `/api/inngest` endpoint is accessible

### Functions Not Executing

- ✅ Check function triggers are correct
- ✅ Verify events are being sent (check event history)
- ✅ Check function logs for errors
- ✅ Ensure database connections work

### Local Dev Server Issues

- ✅ Ensure Inngest dev server is running (`inngest dev`)
- ✅ Check backend is accessible at `http://localhost:8000`
- ✅ Verify serve endpoint works: `curl http://localhost:8000/api/inngest`

## Next Steps

1. **Set up automation rules** in your repository settings
2. **Test locally** using the dev server
3. **Deploy to production** with environment variables
4. **Monitor** function execution in the dashboard

For detailed documentation, see `INNGEST_SETUP.md`.

