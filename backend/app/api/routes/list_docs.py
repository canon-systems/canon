from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.auth import get_current_user
from app.core.database import get_supabase
from supabase import Client
from typing import Dict, Any, Optional, List
from datetime import datetime

router = APIRouter()

@router.get("/docs")
async def list_docs(
    status: Optional[str] = Query(None, description="Filter by approval status: pending_review, approved, published, rejected"),
    repo: Optional[str] = Query(None, description="Filter by repo URL"),
    search: Optional[str] = Query(None, description="Search by title, repo, or path"),
    page: int = Query(1, ge=1, description="Page number"),
    pageSize: int = Query(20, ge=1, le=100, description="Items per page"),
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
) -> Dict[str, Any]:
    """
    List documents with filtering, search, and pagination.
    Returns documents with approval status and push metadata.
    """
    try:
        # Build query - fetch all docs for user first (we'll filter in Python due to JSON fields)
        query = supabase.table('submissions').select('*').eq('created_by', user['id'])
        
        # Order by created_at descending (updated_at doesn't exist in submissions table)
        query = query.order('created_at', desc=True)
        
        # Fetch all matching docs (we'll paginate in Python due to JSON filtering)
        result = query.execute()
        
        if not result.data:
            return {
                "items": [],
                "pagination": {
                    "page": page,
                    "pageSize": pageSize,
                    "total": 0
                }
            }
        
        # Filter by approval_status, repo, and search
        filtered_docs = []
        for doc in result.data:
            source_meta = doc.get('source_meta', {}) or {}
            approval_status = source_meta.get('approval_status', 'pending_review')
            
            # Status filter
            if status and approval_status != status:
                continue
            
            # Repo filter
            if repo:
                repo_url = source_meta.get('repoUrl', '')
                if repo not in repo_url:
                    continue
            
            # Search filter
            if search:
                search_lower = search.lower()
                title_match = search_lower in (doc.get('title', '') or '').lower()
                repo_match = search_lower in (source_meta.get('repoUrl', '') or '').lower()
                path_match = search_lower in (source_meta.get('path', '') or '').lower()
                if not (title_match or repo_match or path_match):
                    continue
            
            filtered_docs.append(doc)
        
        # Paginate
        total = len(filtered_docs)
        start = (page - 1) * pageSize
        end = start + pageSize
        paginated_docs = filtered_docs[start:end]
        
        # Format response
        items = []
        for doc in paginated_docs:
            source_meta = doc.get('source_meta', {}) or {}
            approval_status = source_meta.get('approval_status', 'pending_review')
            
            # Extract push metadata
            push_meta = source_meta.get('push_metadata', {}) or {}
            last_pushed_provider = push_meta.get('provider')
            last_pushed_at = push_meta.get('pushed_at')
            
            # Use updated_at if available, otherwise last_checked_at, otherwise created_at
            updated_at = doc.get('updated_at') or doc.get('last_checked_at') or doc.get('created_at')
            
            items.append({
                "id": doc.get('id'),
                "title": doc.get('title', 'Untitled'),
                "status": approval_status,  # approval_status, not processing status
                "repo": source_meta.get('repoUrl', ''),
                "path": source_meta.get('path', '/'),
                "commit": source_meta.get('commit', ''),
                "createdAt": doc.get('created_at'),
                "updatedAt": updated_at,
                "lastPushedProvider": last_pushed_provider,
                "lastPushedAt": last_pushed_at,
                # Also include processing status for reference
                "processingStatus": doc.get('status'),
                "isOutdated": doc.get('is_outdated', False)
            })
        
        return {
            "items": items,
            "pagination": {
                "page": page,
                "pageSize": pageSize,
                "total": total
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list documents: {str(e)}")

