from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.auth import get_current_user
from app.core.database import get_supabase
from supabase import Client
from typing import Dict, Any, Optional, List
import difflib

router = APIRouter()

@router.get("/diff")
async def get_diff(
    docId: str = Query(..., alias="docId"),
    compareWith: Optional[str] = Query(None, description="Version ID or 'original' to compare with"),
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
) -> Dict[str, Any]:
    """
    Get text diff for a document.
    Compares current version with previous version or original.
    Returns unified diff format with segments.
    """
    try:
        # Fetch current document
        current_result = supabase.table('submissions').select('*').eq('id', docId).single().execute()
        
        if not current_result.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        current_doc = current_result.data
        
        # Verify ownership
        if current_doc.get('created_by') != user['id']:
            raise HTTPException(status_code=403, detail="Forbidden")
        
        current_text = current_doc.get('markdown', '')
        
        # Determine what to compare with
        if compareWith == 'original':
            # Compare with original version (first version)
            # For now, we'll use the current version as baseline
            # In a full implementation, you'd store version history
            previous_text = current_text
        elif compareWith:
            # Compare with specific version ID
            # This would require a versions table - for now, use current
            previous_text = current_text
        else:
            # Compare with previous version (if available)
            # For now, we'll return empty diff or compare with empty string
            # In production, you'd fetch from a versions table
            previous_text = ""
        
        # Generate diff using difflib
        current_lines = current_text.splitlines(keepends=True)
        previous_lines = previous_text.splitlines(keepends=True)
        
        # Create unified diff
        diff = list(difflib.unified_diff(
            previous_lines,
            current_lines,
            fromfile='previous',
            tofile='current',
            lineterm=''
        ))
        
        # Also create segment-based diff for easier frontend rendering
        segments: List[Dict[str, Any]] = []
        matcher = difflib.SequenceMatcher(None, previous_lines, current_lines)
        
        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            if tag == 'equal':
                # Unchanged lines
                for line in current_lines[j1:j2]:
                    segments.append({
                        "type": "unchanged",
                        "text": line.rstrip('\n'),
                        "line_number": len([s for s in segments if s.get("type") != "removed"]) + 1
                    })
            elif tag == 'delete':
                # Removed lines
                for line in previous_lines[i1:i2]:
                    segments.append({
                        "type": "removed",
                        "text": line.rstrip('\n'),
                        "line_number": None
                    })
            elif tag == 'insert':
                # Added lines
                for line in current_lines[j1:j2]:
                    segments.append({
                        "type": "added",
                        "text": line.rstrip('\n'),
                        "line_number": len([s for s in segments if s.get("type") != "removed"]) + 1
                    })
            elif tag == 'replace':
                # Modified lines - show as removed then added
                for line in previous_lines[i1:i2]:
                    segments.append({
                        "type": "removed",
                        "text": line.rstrip('\n'),
                        "line_number": None
                    })
                for line in current_lines[j1:j2]:
                    segments.append({
                        "type": "added",
                        "text": line.rstrip('\n'),
                        "line_number": len([s for s in segments if s.get("type") != "removed"]) + 1
                    })
        
        return {
            "doc_id": docId,
            "unified_diff": ''.join(diff),
            "segments": segments,
            "stats": {
                "added": len([s for s in segments if s["type"] == "added"]),
                "removed": len([s for s in segments if s["type"] == "removed"]),
                "unchanged": len([s for s in segments if s["type"] == "unchanged"])
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate diff: {str(e)}")

