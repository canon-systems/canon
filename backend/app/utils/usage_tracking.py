"""
Usage Tracking Utility
Tracks events like doc generation, diagram generation, repo scans, and KB pushes.
"""
from typing import Dict, Any, Optional
from supabase import Client
from datetime import datetime


def track_usage_event(
    supabase: Client,
    workspace_id: str,
    event_type: str,
    metadata: Optional[Dict[str, Any]] = None
) -> None:
    """
    Track a usage event.
    
    Args:
        supabase: Supabase client
        workspace_id: Workspace/user ID
        event_type: Type of event (doc_generated, diagram_generated, repo_scan_run, push_to_kb, etc.)
        metadata: Optional metadata about the event
    """
    try:
        supabase.table('usage_events').insert({
            'workspace_id': workspace_id,
            'event_type': event_type,
            'metadata': metadata or {},
            'created_at': datetime.utcnow().isoformat()
        }).execute()
    except Exception as e:
        # Don't fail the main operation if tracking fails
        print(f"Failed to track usage event {event_type}: {e}")


def track_doc_generated(
    supabase: Client,
    workspace_id: str,
    doc_id: Optional[str] = None,
    repo_id: Optional[str] = None,
    auto_published: bool = False
) -> None:
    """Track documentation generation event."""
    track_usage_event(
        supabase,
        workspace_id,
        'doc_generated',
        {
            'doc_id': doc_id,
            'repo_id': repo_id,
            'auto_published': auto_published
        }
    )


def track_diagram_generated(
    supabase: Client,
    workspace_id: str,
    diagram_id: Optional[str] = None,
    repo_id: Optional[str] = None
) -> None:
    """Track architecture diagram generation event."""
    track_usage_event(
        supabase,
        workspace_id,
        'diagram_generated',
        {
            'diagram_id': diagram_id,
            'repo_id': repo_id
        }
    )


def track_repo_scan(
    supabase: Client,
    workspace_id: str,
    repo_id: Optional[str] = None,
    repo_url: Optional[str] = None
) -> None:
    """Track repository scan/analysis event."""
    track_usage_event(
        supabase,
        workspace_id,
        'repo_scan_run',
        {
            'repo_id': repo_id,
            'repo_url': repo_url
        }
    )


def track_push_to_kb(
    supabase: Client,
    workspace_id: str,
    provider: str,
    doc_id: Optional[str] = None,
    resource_id: Optional[str] = None
) -> None:
    """Track push to knowledge base event."""
    track_usage_event(
        supabase,
        workspace_id,
        'push_to_kb',
        {
            'provider': provider,
            'doc_id': doc_id,
            'resource_id': resource_id
        }
    )


def track_doc_approved(
    supabase: Client,
    workspace_id: str,
    doc_id: str,
    auto_approved: bool = False,
    diff_size: Optional[int] = None
) -> None:
    """Track document approval event."""
    track_usage_event(
        supabase,
        workspace_id,
        'doc_approved',
        {
            'doc_id': doc_id,
            'auto_approved': auto_approved,
            'diff_size': diff_size
        }
    )


def track_auto_publish(
    supabase: Client,
    workspace_id: str,
    doc_id: str,
    reason: str,
    diff_size: Optional[int] = None
) -> None:
    """Track automatic publish event."""
    track_usage_event(
        supabase,
        workspace_id,
        'doc_auto_published',
        {
            'doc_id': doc_id,
            'reason': reason,
            'diff_size': diff_size
        }
    )

