"""
Inngest Client Configuration
"""
import inngest
from app.config import settings
import os

# Initialize Inngest client
inngest_client = inngest.Inngest(
    app_id="sync-automation",
    event_key=os.getenv("INNGEST_EVENT_KEY") or settings.INNGEST_EVENT_KEY,
    is_production=os.getenv("ENVIRONMENT", "").lower() == "production"
)

# Event definitions
class AutomationEvents:
    """Event names for automation system"""
    CHECK_DUE_RULES = "automation/check-due-rules"
    EXECUTE_RULE = "automation/execute-rule"
    RULE_COMPLETED = "automation/rule-completed"
    RULE_FAILED = "automation/rule-failed"

