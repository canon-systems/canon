from fastapi import APIRouter, Depends, HTTPException
from app.core.auth import get_current_user
from app.core.database import get_supabase
from supabase import Client
from typing import Dict, Any
from datetime import datetime
from app.utils.usage_tracking import track_doc_approved

router = APIRouter()

@router.post("/docs/{doc_id}/approve")
async def approve_doc(
    doc_id: str,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
) -> Dict[str, Any]:
    """
    Approve a document.
    Updates the document status to approved.
    """
    try:
        # Fetch document
        result = supabase.table('submissions').select('*').eq('id', doc_id).single().execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        doc = result.data
        
        # Verify ownership
        if doc.get('created_by') != user['id']:
            raise HTTPException(status_code=403, detail="Forbidden")
        
        # Update document with approval status
        # Store approval status in source_meta
        source_meta = doc.get('source_meta', {}) or {}
        source_meta['approval_status'] = 'approved'
        source_meta['approved_at'] = datetime.utcnow().isoformat()
        source_meta['approved_by'] = user['id']
        
        update_data: Dict[str, Any] = {
            'source_meta': source_meta
        }
        
        update_result = supabase.table('submissions').update(update_data).eq('id', doc_id).execute()
        
        if not update_result.data:
            raise HTTPException(status_code=500, detail="Failed to update document")
        
        # Track approval
        auto_approved = source_meta.get('auto_approved', False)
        track_doc_approved(
            supabase,
            user['id'],
            doc_id=doc_id,
            auto_approved=auto_approved
        )
        
        return {
            "success": True,
            "doc_id": doc_id,
            "approval_status": "approved",
            "approved_at": source_meta.get('approved_at'),
            "approved_by": user['id']
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to approve document: {str(e)}")

