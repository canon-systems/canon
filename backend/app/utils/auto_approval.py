"""
Automatic Approval Logic
Determines when documents can be automatically approved/published without human review.
"""
from typing import Dict, Any, Optional
from app.api.routes.get_diff import get_diff
from supabase import Client


def calculate_diff_size(diff_segments: list) -> Dict[str, int]:
    """
    Calculate the size of a diff.
    
    Returns:
        Dict with 'added', 'removed', 'unchanged', 'total_changes' counts
    """
    added = len([s for s in diff_segments if s.get("type") == "added"])
    removed = len([s for s in diff_segments if s.get("type") == "removed"])
    unchanged = len([s for s in diff_segments if s.get("type") == "unchanged"])
    total_changes = added + removed
    
    return {
        'added': added,
        'removed': removed,
        'unchanged': unchanged,
        'total_changes': total_changes
    }


def should_auto_approve(
    supabase: Client,
    doc_id: str,
    user_id: str,
    rule_config: Optional[Dict[str, Any]] = None,
    previous_doc_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Determine if a document should be automatically approved.
    
    Args:
        supabase: Supabase client
        doc_id: Current document ID
        user_id: User ID (for auth)
        rule_config: Automation rule configuration with auto_publish settings
        previous_doc_id: Previous document ID to compare against (optional)
    
    Returns:
        Dict with:
            - should_approve: bool
            - reason: str
            - diff_size: Optional[Dict] with diff statistics
    """
    # Check if rule explicitly allows auto-publish
    auto_publish_enabled = rule_config and rule_config.get('auto_publish', False)
    
    if not auto_publish_enabled:
        return {
            'should_approve': False,
            'reason': 'auto_publish not enabled in rule',
            'diff_size': None
        }
    
    # If no previous document, this is a new doc - check if rule allows auto-publish for new docs
    if not previous_doc_id:
        allow_new_docs = rule_config.get('auto_publish_new_docs', False)
        return {
            'should_approve': allow_new_docs,
            'reason': 'new_doc' if allow_new_docs else 'new_doc_requires_review',
            'diff_size': None
        }
    
    # Compare with previous document to check diff size
    try:
        # Get diff (we'll need to call the diff endpoint logic)
        # For now, we'll fetch both documents and compare
        current_doc = supabase.table('submissions').select('*').eq('id', doc_id).single().execute()
        previous_doc = supabase.table('submissions').select('*').eq('id', previous_doc_id).single().execute()
        
        if not current_doc.data or not previous_doc.data:
            return {
                'should_approve': False,
                'reason': 'previous_doc_not_found',
                'diff_size': None
            }
        
        current_text = current_doc.data.get('markdown', '')
        previous_text = previous_doc.data.get('markdown', '')
        
        # Calculate diff using simple line comparison
        import difflib
        current_lines = current_text.splitlines()
        previous_lines = previous_text.splitlines()
        
        matcher = difflib.SequenceMatcher(None, previous_lines, current_lines)
        diff_segments = []
        
        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            if tag == 'delete':
                for line in previous_lines[i1:i2]:
                    diff_segments.append({'type': 'removed', 'text': line})
            elif tag == 'insert':
                for line in current_lines[j1:j2]:
                    diff_segments.append({'type': 'added', 'text': line})
            elif tag == 'replace':
                for line in previous_lines[i1:i2]:
                    diff_segments.append({'type': 'removed', 'text': line})
                for line in current_lines[j1:j2]:
                    diff_segments.append({'type': 'added', 'text': line})
        
        diff_size = calculate_diff_size(diff_segments)
        
        # Check if diff is small enough for auto-approval
        max_changes = rule_config.get('auto_publish_max_changes', 50)  # Default: 50 lines
        max_change_percentage = rule_config.get('auto_publish_max_change_percentage', 5.0)  # Default: 5%
        
        total_lines = len(current_lines)
        change_percentage = (diff_size['total_changes'] / total_lines * 100) if total_lines > 0 else 0
        
        # Auto-approve if:
        # 1. Total changes are below threshold, AND
        # 2. Change percentage is below threshold
        if diff_size['total_changes'] <= max_changes and change_percentage <= max_change_percentage:
            return {
                'should_approve': True,
                'reason': f'diff_small_enough (changes: {diff_size["total_changes"]}, percentage: {change_percentage:.1f}%)',
                'diff_size': diff_size
            }
        else:
            return {
                'should_approve': False,
                'reason': f'diff_too_large (changes: {diff_size["total_changes"]}, percentage: {change_percentage:.1f}%)',
                'diff_size': diff_size
            }
    
    except Exception as e:
        # If comparison fails, don't auto-approve
        return {
            'should_approve': False,
            'reason': f'comparison_error: {str(e)}',
            'diff_size': None
        }

