from fastapi import APIRouter, Depends, HTTPException
from app.api.schemas.push import PushRequest, PushResponse
from app.services.workspace import get_workspace_provider
from app.services.workspace.base import WorkspaceInfo, WorkspaceContent
from app.core.auth import get_current_user
from app.core.database import get_supabase
from supabase import Client
from datetime import datetime
from app.utils.usage_tracking import track_push_to_kb

router = APIRouter()

@router.post("/confluence", response_model=PushResponse)
async def push_to_confluence(
    request: PushRequest,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    """
    Publish the finalized documentation to Confluence.
    Creates a new page or updates an existing one.
    """
    try:
        # Get user's connection
        connection = supabase.table('oauth_connections').select('connection_id').eq(
            'user_id', user['id']
        ).eq('provider', 'confluence').eq('status', 'active').single().execute()
        
        if not connection.data:
            raise ValueError("No active Confluence connection found for user")
        
        connection_id = connection.data['connection_id']
        
        # Get workspace provider
        provider = get_workspace_provider('confluence', supabase)
        if not provider:
            raise ValueError("Confluence provider not available")
        
        # Build workspace info
        ws_info = WorkspaceInfo(
            provider='confluence',
            resource_id=request.workspace_info.resource_id if request.workspace_info else None,
            metadata=request.workspace_info.metadata if request.workspace_info else None
        )
        
        # Build content
        content = WorkspaceContent(
            title=request.title,
            markdown=request.markdown
        )
        
        # Push content
        result = await provider.push_content(
            workspace_info=ws_info,
            content=content,
            connection_id=connection_id,
            create_new=request.create_new
        )
        
        if not result:
            raise Exception("Failed to push content to Confluence")
        
        # Track push to KB
        track_push_to_kb(
            supabase,
            user['id'],
            provider='confluence',
            doc_id=request.doc_id,
            resource_id=result.resource_id
        )
        
        # Extract URL from metadata if available
        url = result.metadata.get('url') if result.metadata else None
        
        # Update document with push metadata
        if request.doc_id:
            doc_result = supabase.table('submissions').select('*').eq('id', request.doc_id).single().execute()
            if doc_result.data:
                source_meta = doc_result.data.get('source_meta', {}) or {}
                source_meta['push_metadata'] = {
                    'provider': 'confluence',
                    'pushed_at': datetime.utcnow().isoformat(),
                    'url': url,
                    'resource_id': result.resource_id
                }
                # Also update approval status to published if not already
                if source_meta.get('approval_status') != 'published':
                    source_meta['approval_status'] = 'published'
                
                supabase.table('submissions').update({
                    'source_meta': source_meta,
                    'updated_at': datetime.utcnow().isoformat()
                }).eq('id', request.doc_id).execute()
        
        return {
            'success': True,
            'resource_id': result.resource_id,
            'url': url,
            'workspace_info': {
                'provider': result.provider,
                'resource_id': result.resource_id,
                'metadata': result.metadata
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

