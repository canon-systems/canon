from fastapi import APIRouter, Depends, HTTPException
from app.api.schemas.changes import DetectChangesRequest, DetectChangesResponse
from app.services.change_detector import detect_repository_changes
from app.core.auth import get_current_user
from app.core.database import get_supabase
from supabase import Client

router = APIRouter()

@router.post("/detect-changes", response_model=DetectChangesResponse)
async def detect_changes_endpoint(
    request: DetectChangesRequest,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    """
    Check a connected repository for new changes since the last analysis.
    Compares current state to the last saved snapshot.
    """
    try:
        result = await detect_repository_changes(
            supabase=supabase,
            user_id=user["id"],
            repo_url=request.repo_url,
            branch=request.branch or "main",
            commit_range=request.commit_range,
            submission_id=request.submission_id,
            diagram_id=request.diagram_id
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

