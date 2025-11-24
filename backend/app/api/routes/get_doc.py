from fastapi import APIRouter, Depends, HTTPException
from app.core.auth import get_current_user
from app.core.database import get_supabase
from supabase import Client
from typing import Dict, Any

router = APIRouter()

@router.get("/docs/{doc_id}")
async def get_doc(
    doc_id: str,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
) -> Dict[str, Any]:
    """
    Retrieve a document by ID.
    Returns the document content, metadata, and status.
    """
    try:
        # Fetch document from submissions table
        result = supabase.table('submissions').select('*').eq('id', doc_id).single().execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        doc = result.data
        
        # Verify ownership (optional - you may want to allow shared docs)
        if doc.get('created_by') != user['id']:
            raise HTTPException(status_code=403, detail="Forbidden: You don't have access to this document")
        
        # Use last_checked_at as updated_at if available, otherwise use created_at
        updated_at = doc.get('last_checked_at') or doc.get('created_at')
        
        return {
            "id": doc.get('id'),
            "title": doc.get('title', 'Untitled'),
            "markdown": doc.get('markdown', ''),
            "status": doc.get('status'),
            "approval_status": doc.get('approval_status'),  # May not exist yet
            "created_at": doc.get('created_at'),
            "updated_at": updated_at,
            "input_type": doc.get('input_type'),
            "source_meta": doc.get('source_meta', {}),
            "summary": doc.get('summary'),
            "error_message": doc.get('error_message'),
            "is_outdated": doc.get('is_outdated', False),
            "code_snapshot": doc.get('code_snapshot')
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve document: {str(e)}")

