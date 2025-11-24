"""
Automation Rules System
Manages scheduling and execution of automation rules for repositories.
"""
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from supabase import Client
import re


def parse_schedule(schedule: str) -> Dict[str, Any]:
    """
    Parse a schedule string into a structured format.
    
    Supported formats:
    - "every_night" or "daily" -> runs at midnight
    - "every_monday" -> runs on Mondays at midnight
    - "every_week" -> runs once a week (Monday)
    - "cron:0 0 * * *" -> custom cron expression
    - "interval:24h" -> every 24 hours
    
    Returns:
        Dict with schedule_type and schedule_config
    """
    schedule = schedule.lower().strip()
    
    if schedule in ['every_night', 'daily', 'nightly']:
        return {
            'schedule_type': 'daily',
            'schedule_config': {'hour': 0, 'minute': 0}
        }
    elif schedule == 'every_monday':
        return {
            'schedule_type': 'weekly',
            'schedule_config': {'day_of_week': 0, 'hour': 0, 'minute': 0}  # Monday = 0
        }
    elif schedule == 'every_week':
        return {
            'schedule_type': 'weekly',
            'schedule_config': {'day_of_week': 0, 'hour': 0, 'minute': 0}
        }
    elif schedule.startswith('cron:'):
        cron_expr = schedule[5:].strip()
        return {
            'schedule_type': 'cron',
            'schedule_config': {'expression': cron_expr}
        }
    elif schedule.startswith('interval:'):
        # Parse interval like "24h", "12h", "1d"
        interval_str = schedule[9:].strip()
        match = re.match(r'(\d+)([hd])', interval_str)
        if match:
            value = int(match.group(1))
            unit = match.group(2)
            if unit == 'h':
                hours = value
            elif unit == 'd':
                hours = value * 24
            else:
                hours = 24
            
            return {
                'schedule_type': 'interval',
                'schedule_config': {'hours': hours}
            }
    
    # Default to daily
    return {
        'schedule_type': 'daily',
        'schedule_config': {'hour': 0, 'minute': 0}
    }


def is_rule_due(
    rule: Dict[str, Any],
    last_run_at: Optional[str] = None,
    current_time: Optional[datetime] = None
) -> bool:
    """
    Check if an automation rule is due to run.
    
    Args:
        rule: Rule configuration dict
        last_run_at: ISO timestamp of last run (optional)
        current_time: Current time (optional, defaults to now)
    
    Returns:
        True if rule should run now
    """
    if current_time is None:
        current_time = datetime.utcnow()
    
    schedule = rule.get('schedule')
    if not schedule:
        return False
    
    parsed = parse_schedule(schedule)
    schedule_type = parsed['schedule_type']
    config = parsed['schedule_config']
    
    # If never run before, check if it's time based on schedule
    if not last_run_at:
        if schedule_type == 'daily':
            # Run if current hour matches
            return current_time.hour == config.get('hour', 0) and current_time.minute == config.get('minute', 0)
        elif schedule_type == 'weekly':
            # Run if current day matches and hour/minute match
            return (current_time.weekday() == config.get('day_of_week', 0) and
                   current_time.hour == config.get('hour', 0) and
                   current_time.minute == config.get('minute', 0))
        elif schedule_type == 'interval':
            # For interval, we need last_run_at, so return False if never run
            return False
        else:
            return False
    
    # Parse last run time
    try:
        last_run = datetime.fromisoformat(last_run_at.replace('Z', '+00:00'))
        if last_run.tzinfo:
            last_run = last_run.replace(tzinfo=None)
    except:
        return False
    
    time_since_last = current_time - last_run
    
    if schedule_type == 'daily':
        # Run if it's been at least 23 hours and we're at the scheduled time
        hours_since = time_since_last.total_seconds() / 3600
        return (hours_since >= 23 and
               current_time.hour == config.get('hour', 0) and
               current_time.minute == config.get('minute', 0))
    
    elif schedule_type == 'weekly':
        # Run if it's been at least 6 days and we're at the scheduled day/time
        days_since = time_since_last.days
        return (days_since >= 6 and
               current_time.weekday() == config.get('day_of_week', 0) and
               current_time.hour == config.get('hour', 0) and
               current_time.minute == config.get('minute', 0))
    
    elif schedule_type == 'interval':
        # Run if interval has passed
        hours_since = time_since_last.total_seconds() / 3600
        required_hours = config.get('hours', 24)
        return hours_since >= required_hours
    
    return False


def get_rules_for_repo(
    supabase: Client,
    repo_id: str,
    workspace_id: str
) -> List[Dict[str, Any]]:
    """
    Get automation rules for a repository.
    Rules are stored in workspace_repos.settings.automation_rules
    """
    try:
        result = supabase.table('workspace_repos').select('settings').eq(
            'id', repo_id
        ).eq('workspace_id', workspace_id).single().execute()
        
        if not result.data:
            return []
        
        settings = result.data.get('settings', {}) or {}
        rules = settings.get('automation_rules', [])
        
        if not isinstance(rules, list):
            return []
        
        return rules
    except:
        return []


def get_due_rules(
    supabase: Client,
    workspace_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Get all automation rules that are due to run.
    
    Returns:
        List of dicts with 'repo_id', 'repo', 'rule' keys
    """
    due_rules = []
    
    try:
        # Get all repos with automation rules
        query = supabase.table('workspace_repos').select('*')
        if workspace_id:
            query = query.eq('workspace_id', workspace_id)
        
        repos_result = query.execute()
        
        if not repos_result.data:
            return []
        
        current_time = datetime.utcnow()
        
        for repo in repos_result.data:
            settings = repo.get('settings', {}) or {}
            rules = settings.get('automation_rules', [])
            
            if not isinstance(rules, list):
                continue
            
            # Get last run times from metadata
            rule_metadata = settings.get('automation_metadata', {}) or {}
            
            for rule in rules:
                if not rule.get('enabled', False):
                    continue
                
                rule_id = rule.get('id') or rule.get('name', 'default')
                last_run_at = rule_metadata.get(rule_id, {}).get('last_run_at')
                
                if is_rule_due(rule, last_run_at, current_time):
                    due_rules.append({
                        'repo_id': repo['id'],
                        'repo': repo,
                        'rule': rule,
                        'rule_id': rule_id
                    })
        
        return due_rules
    
    except Exception as e:
        print(f"Error getting due rules: {e}")
        return []


def update_rule_last_run(
    supabase: Client,
    repo_id: str,
    rule_id: str,
    workspace_id: str
) -> None:
    """Update the last run timestamp for a rule."""
    try:
        result = supabase.table('workspace_repos').select('settings').eq(
            'id', repo_id
        ).eq('workspace_id', workspace_id).single().execute()
        
        if not result.data:
            return
        
        settings = result.data.get('settings', {}) or {}
        metadata = settings.get('automation_metadata', {}) or {}
        
        if rule_id not in metadata:
            metadata[rule_id] = {}
        
        metadata[rule_id]['last_run_at'] = datetime.utcnow().isoformat()
        metadata[rule_id]['last_run_status'] = 'success'
        
        settings['automation_metadata'] = metadata
        
        supabase.table('workspace_repos').update({
            'settings': settings,
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', repo_id).execute()
    
    except Exception as e:
        print(f"Error updating rule last run: {e}")

