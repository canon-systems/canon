from fastapi import APIRouter, Depends, HTTPException
from app.api.schemas.analyze import AnalyzeRepoRequest, AnalyzeRepoResponse
from app.services.repo_analyzer import analyze_repository
from app.core.auth import get_current_user
from app.core.database import get_supabase
from supabase import Client

router = APIRouter()

@router.post("/analyze-repo", response_model=AnalyzeRepoResponse)
async def analyze_repo_endpoint(
    request: AnalyzeRepoRequest,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    """
    Analyze a repository's contents and ingest it into the system.
    Creates a code snapshot for future change detection.
    """
    try:
        result = await analyze_repository(
            supabase=supabase,
            user_id=user["id"],
            repo_url=request.repo_url,
            branch=request.branch or "main",
            subdir=request.subdir,
            filters=request.filters
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

