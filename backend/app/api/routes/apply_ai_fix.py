from fastapi import APIRouter, Depends, HTTPException
from app.api.schemas.ai_fix import ApplyAIFixRequest, ApplyAIFixResponse
from app.services.ai_fix import apply_ai_fix_to_doc
from app.core.auth import get_current_user
from app.core.database import get_supabase
from supabase import Client

router = APIRouter()

@router.post("/apply-ai-fix", response_model=ApplyAIFixResponse)
async def apply_ai_fix_endpoint(
    request: ApplyAIFixRequest,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    """
    Use AI to improve or fix a portion of the documentation.
    Returns the updated full markdown with the fixed section.
    """
    try:
        result = await apply_ai_fix_to_doc(
            supabase=supabase,
            user_id=user["id"],
            model=request.model,
            doc_id=request.doc_id,
            markdown_content=request.markdown_content,
            section=request.section,
            issue=request.issue,
            instruction=request.instruction
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

