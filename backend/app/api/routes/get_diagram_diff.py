from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.auth import get_current_user
from app.core.database import get_supabase
from supabase import Client
from typing import Dict, Any, Optional, List

router = APIRouter()

@router.get("/diagram-diff")
async def get_diagram_diff(
    docId: str = Query(..., alias="docId"),
    compareWith: Optional[str] = Query(None, description="Version ID to compare with"),
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
) -> Dict[str, Any]:
    """
    Get architecture diagram diff.
    Compares current diagram with previous version.
    Returns added/removed nodes and edges.
    """
    try:
        # For now, we'll check if this doc has an associated diagram
        # In a full implementation, you'd have a diagram_id field in submissions
        # or a separate mapping table
        
        # Check if document exists
        doc_result = supabase.table('submissions').select('*').eq('id', docId).single().execute()
        
        if not doc_result.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        doc = doc_result.data
        
        # Verify ownership
        if doc.get('created_by') != user['id']:
            raise HTTPException(status_code=403, detail="Forbidden")
        
        # Try to find associated architecture diagram
        # This is a simplified approach - in production you'd have proper relationships
        diagram_result = supabase.table('architecture_diagrams').select('*').eq(
            'user_id', user['id']
        ).order('created_at', desc=True).limit(1).execute()
        
        current_diagram = diagram_result.data[0] if diagram_result.data else None
        
        if not current_diagram:
            return {
                "doc_id": docId,
                "has_diagram": False,
                "added_nodes": [],
                "removed_nodes": [],
                "added_edges": [],
                "removed_edges": []
            }
        
        # Get current diagram data
        current_tools = current_diagram.get('tools', [])
        current_connections = current_diagram.get('connections', [])
        
        # For comparison, try to get previous version
        if compareWith:
            prev_result = supabase.table('architecture_diagram_versions').select('*').eq(
                'id', compareWith
            ).single().execute()
            previous_diagram = prev_result.data if prev_result.data else None
        else:
            # Get previous version from versions table
            prev_result = supabase.table('architecture_diagram_versions').select('*').eq(
                'diagram_id', current_diagram['id']
            ).order('created_at', desc=True).limit(2).execute()
            
            if prev_result.data and len(prev_result.data) > 1:
                previous_diagram = prev_result.data[1]  # Second most recent
            else:
                previous_diagram = None
        
        if not previous_diagram:
            # No previous version - everything is new
            return {
                "doc_id": docId,
                "has_diagram": True,
                "added_nodes": current_tools,
                "removed_nodes": [],
                "added_edges": current_connections,
                "removed_edges": []
            }
        
        # Compare tools (nodes)
        previous_tools = previous_diagram.get('tools', [])
        previous_tool_names = {t.get('name'): t for t in previous_tools}
        current_tool_names = {t.get('name'): t for t in current_tools}
        
        added_nodes = [t for name, t in current_tool_names.items() if name not in previous_tool_names]
        removed_nodes = [t for name, t in previous_tool_names.items() if name not in current_tool_names]
        
        # Compare connections (edges)
        previous_connections = previous_diagram.get('connections', [])
        previous_conn_keys = {f"{c.get('from')}->{c.get('to')}": c for c in previous_connections}
        current_conn_keys = {f"{c.get('from')}->{c.get('to')}": c for c in current_connections}
        
        added_edges = [c for key, c in current_conn_keys.items() if key not in previous_conn_keys]
        removed_edges = [c for key, c in previous_conn_keys.items() if key not in current_conn_keys]
        
        return {
            "doc_id": docId,
            "has_diagram": True,
            "added_nodes": added_nodes,
            "removed_nodes": removed_nodes,
            "added_edges": added_edges,
            "removed_edges": removed_edges,
            "current_diagram_markdown": current_diagram.get('mermaid_markdown')
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate diagram diff: {str(e)}")

