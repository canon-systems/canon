from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.core.auth import get_current_user
from app.core.database import get_supabase
from supabase import Client
from typing import Dict, Any
from datetime import datetime

router = APIRouter()

class RejectRequest(BaseModel):
    reason: Optional[str] = None

@router.post("/docs/{doc_id}/reject")
async def reject_doc(
    doc_id: str,
    request: Optional[RejectRequest] = None,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
) -> Dict[str, Any]:
    """
    Reject a document.
    Updates the document status to rejected with optional reason.
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
        
        # Update document with rejection status
        # Store rejection in source_meta
        source_meta = doc.get('source_meta', {}) or {}
        source_meta['approval_status'] = 'rejected'
        source_meta['rejected_at'] = datetime.utcnow().isoformat()
        source_meta['rejected_by'] = user['id']
        if request and request.reason:
            source_meta['rejection_reason'] = request.reason
        
        update_data: Dict[str, Any] = {
            'source_meta': source_meta
        }
        
        update_result = supabase.table('submissions').update(update_data).eq('id', doc_id).execute()
        
        if not update_result.data:
            raise HTTPException(status_code=500, detail="Failed to update document")
        
        return {
            "success": True,
            "doc_id": doc_id,
            "approval_status": "rejected",
            "rejected_at": source_meta.get('rejected_at'),
            "rejected_by": user['id'],
            "reason": request.reason if request else None
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reject document: {str(e)}")

