# Inngest Setup Guide

This guide walks you through setting up Inngest for automation orchestration and scheduling.

## What is Inngest?

Inngest is a developer platform for building reliable workflows, scheduled jobs, and event-driven functions. It provides:
- **Reliable execution** with automatic retries
- **Scheduling** with cron-like expressions
- **Event-driven workflows** for complex orchestration
- **Observability** with built-in dashboards
- **No infrastructure** to manage

## Step 1: Create Inngest Account

1. Go to [https://www.inngest.com](https://www.inngest.com)
2. Sign up for a free account
3. Create a new app (e.g., "sync-automation")

## Step 2: Get Your Inngest Credentials

After creating your app, you'll get:
- **Event Key**: Used to send events to Inngest
- **Signing Key**: Used to verify requests from Inngest (optional but recommended)

Save these as environment variables:
```bash
INNGEST_EVENT_KEY=your_event_key_here
INNGEST_SIGNING_KEY=your_signing_key_here  # Optional
```

## Step 3: Install Inngest SDK

The Python SDK is already added to `requirements.txt`:
```bash
pip install inngest==0.3.0
```

## Step 4: Install Inngest Dev Server (for local development)

For local development, you'll need the Inngest dev server:

```bash
# Using npm
npm install -g inngest

# Or using Homebrew (macOS)
brew install inngest/tap/inngest

# Or download from https://www.inngest.com/docs/local-development
```

## Step 5: Configure Your Backend

### 5.1 Environment Variables

Add to your `.env` file or environment:
```bash
# Inngest Configuration
INNGEST_EVENT_KEY=your_event_key_here
INNGEST_SIGNING_KEY=your_signing_key_here  # Optional
INNGEST_SERVE_PATH=/api/inngest  # Path where Inngest will call your functions

# For local development
INNGEST_DEV_SERVER_URL=http://localhost:8288  # Default Inngest dev server URL
```

### 5.2 Inngest Client Setup

The client is configured in `backend/app/core/inngest.py`:
- `app_id`: Unique identifier for your app
- `event_key`: Your Inngest event key
- `is_production`: Set based on environment

### 5.3 Serve Endpoint

Inngest needs an endpoint to discover and invoke your functions. This is added to your FastAPI app in `main.py`.

## Step 6: Local Development Setup

### 6.1 Start Inngest Dev Server

In a separate terminal:
```bash
inngest dev
```

This starts the Inngest dev server at `http://localhost:8288` and provides a dashboard at `http://localhost:8288/debug`.

### 6.2 Start Your Backend

Your backend needs to be running and accessible to Inngest:
```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

### 6.3 Register Functions

When your backend starts, it will automatically register functions with Inngest via the serve endpoint.

## Step 7: Function Types

Inngest supports several function types:

### 7.1 Scheduled Functions (Cron Jobs)

Functions that run on a schedule:
```python
@inngest_client.create_function(
    fn_id="check-due-rules",
    name="Check Due Automation Rules",
    trigger=inngest.TriggerCron(cron="0 * * * *")  # Every hour
)
```

### 7.2 Event-Driven Functions

Functions triggered by events:
```python
@inngest_client.create_function(
    fn_id="execute-rule",
    name="Execute Automation Rule",
    trigger=inngest.TriggerEvent(event="automation/execute-rule")
)
```

### 7.3 HTTP Functions

Functions triggered by HTTP requests:
```python
@inngest_client.create_function(
    fn_id="manual-trigger",
    name="Manual Automation Trigger",
    trigger=inngest.TriggerHTTP(method="POST", path="/api/automation/trigger")
)
```

## Step 8: Deployment

### 8.1 Production Environment Variables

Set these in your production environment (Vercel, Railway, etc.):
```bash
INNGEST_EVENT_KEY=your_production_event_key
INNGEST_SIGNING_KEY=your_production_signing_key  # Recommended
INNGEST_SERVE_PATH=/api/inngest
```

### 8.2 Inngest Cloud

Inngest Cloud automatically discovers your functions when:
1. Your app is deployed and accessible
2. Inngest can reach your serve endpoint
3. Functions are registered on startup

### 8.3 Webhook Configuration (Optional)

If your app is behind authentication, you may need to configure webhooks in the Inngest dashboard.

## Step 9: Monitoring and Debugging

### 9.1 Inngest Dashboard

- **Local**: `http://localhost:8288/debug`
- **Production**: Your Inngest app dashboard

### 9.2 Function Logs

View function execution logs, retries, and errors in the dashboard.

### 9.3 Event History

See all events sent to Inngest and their processing status.

## Step 10: Testing Your Setup

### 10.1 Test Event Sending

```python
from app.core.inngest import inngest_client

# Send a test event
await inngest_client.send_sync(
    inngest.Event(
        name="automation/execute-rule",
        data={
            "repo_id": "test-repo-id",
            "rule_id": "test-rule-id",
            "workspace_id": "test-workspace-id"
        }
    )
)
```

### 10.2 Test Scheduled Function

Scheduled functions will run automatically. Check the dashboard to see execution.

### 10.3 Test HTTP Function

```bash
curl -X POST http://localhost:8000/api/automation/trigger \
  -H "Content-Type: application/json" \
  -d '{"repo_id": "test-repo-id"}'
```

## Architecture Overview

```
┌─────────────────┐
│  Your Backend   │
│  (FastAPI)      │
│                 │
│  ┌───────────┐ │
│  │ Functions │ │
│  │ (Inngest)  │ │
│  └───────────┘ │
└────────┬────────┘
         │
         │ HTTP/Webhook
         │
┌────────▼────────┐
│  Inngest Cloud  │
│                 │
│  - Scheduling   │
│  - Execution    │
│  - Retries      │
│  - Monitoring   │
└─────────────────┘
```

## Common Patterns

### Pattern 1: Scheduled Rule Checker

A function that runs hourly to find due rules and triggers execution:

```python
@inngest_client.create_function(
    fn_id="check-due-rules",
    name="Check Due Automation Rules",
    trigger=inngest.TriggerCron(cron="0 * * * *")
)
async def check_due_rules(ctx: inngest.Context, step: inngest.Step):
    # Find due rules
    due_rules = get_due_rules(supabase)
    
    # Trigger execution for each rule
    for rule_info in due_rules:
        await inngest_client.send_sync(
            inngest.Event(
                name="automation/execute-rule",
                data={
                    "repo_id": rule_info['repo_id'],
                    "rule_id": rule_info['rule_id'],
                    "workspace_id": rule_info['workspace_id']
                }
            )
        )
```

### Pattern 2: Rule Execution with Retries

A function that executes a rule with automatic retries:

```python
@inngest_client.create_function(
    fn_id="execute-rule",
    name="Execute Automation Rule",
    trigger=inngest.TriggerEvent(event="automation/execute-rule"),
    retries=3  # Retry up to 3 times on failure
)
async def execute_rule(ctx: inngest.Context, step: inngest.Step):
    event_data = ctx.event.data
    
    # Execute rule with automatic retries
    result = await execute_rule_logic(
        repo_id=event_data['repo_id'],
        rule_id=event_data['rule_id'],
        workspace_id=event_data['workspace_id']
    )
    
    return result
```

### Pattern 3: Multi-Step Workflow

Chain multiple steps together:

```python
@inngest_client.create_function(
    fn_id="full-automation-workflow",
    name="Full Automation Workflow",
    trigger=inngest.TriggerEvent(event="automation/execute-rule")
)
async def full_workflow(ctx: inngest.Context, step: inngest.Step):
    event_data = ctx.event.data
    
    # Step 1: Detect changes
    changes = await step.run("detect-changes", lambda: detect_changes(...))
    
    if changes['has_changes']:
        # Step 2: Generate doc
        doc = await step.run("generate-doc", lambda: generate_doc(...))
        
        # Step 3: Auto-approve if needed
        if should_auto_approve(doc):
            await step.run("auto-approve", lambda: approve_doc(...))
            
            # Step 4: Publish
            await step.run("publish", lambda: publish_to_kb(...))
```

## Troubleshooting

### Functions Not Appearing

1. Check that your serve endpoint is accessible
2. Verify `INNGEST_EVENT_KEY` is set correctly
3. Check backend logs for registration errors
4. Ensure Inngest dev server is running (for local dev)

### Functions Not Executing

1. Check function triggers are configured correctly
2. Verify events are being sent (check event history)
3. Check function logs for errors
4. Ensure database connections are working

### Authentication Issues

1. Verify `INNGEST_SIGNING_KEY` if using signing
2. Check webhook configuration in Inngest dashboard
3. Ensure your backend is accessible from the internet (for production)

## Next Steps

1. **Complete the setup**: Follow steps 1-6 for local development
2. **Review the implementation**: See `backend/app/functions/automation.py` for function definitions
3. **Test locally**: Use the Inngest dev server and dashboard
4. **Deploy**: Set production environment variables and deploy
5. **Monitor**: Use the Inngest dashboard to monitor function execution

## Resources

- [Inngest Documentation](https://www.inngest.com/docs)
- [Python SDK Reference](https://www.inngest.com/docs/sdk/python)
- [Inngest Dashboard](https://app.inngest.com)

