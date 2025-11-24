"""
Inngest Functions for Automation
"""
import inngest
from app.core.inngest import inngest_client, AutomationEvents
from app.core.database import get_supabase
from app.utils.automation_rules import get_due_rules, update_rule_last_run
from app.api.routes.automation_job import execute_rule
from supabase import Client
from typing import Dict, Any


@inngest_client.create_function(
    fn_id="check-due-rules",
    name="Check Due Automation Rules",
    trigger=inngest.TriggerCron(cron="0 * * * *"),  # Every hour
    retries=2
)
async def check_due_rules(ctx: inngest.Context, step: inngest.Step) -> Dict[str, Any]:
    """
    Scheduled function that runs hourly to find and trigger execution of due rules.
    """
    # Get Supabase client
    from app.core.database import get_supabase
    supabase = get_supabase()
    
    # Find all due rules
    due_rules = await step.run("find-due-rules", lambda: get_due_rules(supabase))
    
    if not due_rules:
        return {
            "success": True,
            "rules_checked": 0,
            "rules_triggered": 0
        }
    
    # Trigger execution for each due rule
    triggered = 0
    for rule_info in due_rules:
        try:
            await step.run(
                f"trigger-rule-{rule_info['rule_id']}",
                lambda: inngest_client.send_sync(
                    inngest.Event(
                        name=AutomationEvents.EXECUTE_RULE,
                        data={
                            "repo_id": rule_info['repo']['id'],
                            "rule_id": rule_info['rule_id'],
                            "workspace_id": rule_info['repo']['workspace_id'],
                            "repo": rule_info['repo'],
                            "rule": rule_info['rule']
                        }
                    )
                )
            )
            triggered += 1
        except Exception as e:
            print(f"Failed to trigger rule {rule_info['rule_id']}: {e}")
    
    return {
        "success": True,
        "rules_checked": len(due_rules),
        "rules_triggered": triggered
    }


@inngest_client.create_function(
    fn_id="execute-automation-rule",
    name="Execute Automation Rule",
    trigger=inngest.TriggerEvent(event=AutomationEvents.EXECUTE_RULE),
    retries=3  # Retry up to 3 times on failure
)
async def execute_automation_rule(ctx: inngest.Context, step: inngest.Step) -> Dict[str, Any]:
    """
    Execute an automation rule for a repository.
    This function is triggered by the check-due-rules function or can be triggered manually.
    """
    event_data = ctx.event.data
    
    repo_id = event_data.get("repo_id")
    rule_id = event_data.get("rule_id")
    workspace_id = event_data.get("workspace_id")
    repo = event_data.get("repo")
    rule = event_data.get("rule")
    
    # Get Supabase client
    from app.core.database import get_supabase
    supabase = get_supabase()
    
    # If repo and rule not in event data, fetch them
    if not repo or not rule:
        repo_result = await step.run(
            "fetch-repo",
            lambda: supabase.table('workspace_repos').select('*').eq(
                'id', repo_id
            ).eq('workspace_id', workspace_id).single().execute()
        )
        
        if not repo_result.data:
            raise Exception(f"Repository {repo_id} not found")
        
        repo = repo_result.data
        settings = repo.get('settings', {}) or {}
        rules = settings.get('automation_rules', [])
        rule = next((r for r in rules if (r.get('id') or r.get('name', 'default')) == rule_id), None)
        
        if not rule:
            raise Exception(f"Rule {rule_id} not found")
    
    # Execute the rule
    execution_result = await step.run(
        "execute-rule",
        lambda: execute_rule(
            supabase=supabase,
            repo=repo,
            rule=rule,
            workspace_id=workspace_id
        )
    )
    
    # Update last run time if successful
    if execution_result.get('success'):
        await step.run(
            "update-last-run",
            lambda: update_rule_last_run(supabase, repo_id, rule_id, workspace_id)
        )
        
        # Send success event
        await step.run(
            "send-success-event",
            lambda: inngest_client.send_sync(
                inngest.Event(
                    name=AutomationEvents.RULE_COMPLETED,
                    data={
                        "repo_id": repo_id,
                        "rule_id": rule_id,
                        "workspace_id": workspace_id,
                        "result": execution_result
                    }
                )
            )
        )
    else:
        # Send failure event
        await step.run(
            "send-failure-event",
            lambda: inngest_client.send_sync(
                inngest.Event(
                    name=AutomationEvents.RULE_FAILED,
                    data={
                        "repo_id": repo_id,
                        "rule_id": rule_id,
                        "workspace_id": workspace_id,
                        "errors": execution_result.get('errors', [])
                    }
                )
            )
        )
    
    return execution_result


# Manual trigger is handled via a regular FastAPI endpoint, not an Inngest function
# See app/api/routes/automation_job.py for the HTTP endpoint

