from fastapi import APIRouter, Depends, HTTPException
from app.api.schemas.template import ApplyTemplateRequest, ApplyTemplateResponse
from app.services.template_engine import apply_template_to_doc
from app.core.auth import get_current_user
from app.core.database import get_supabase
from supabase import Client

router = APIRouter()

@router.post("/apply-template", response_model=ApplyTemplateResponse)
async def apply_template_endpoint(
    request: ApplyTemplateRequest,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    """
    Apply a documentation template to a given doc draft.
    Transforms the documentation content to fit the template structure.
    """
    try:
        result = await apply_template_to_doc(
            supabase=supabase,
            user_id=user["id"],
            doc_id=request.doc_id,
            markdown_content=request.markdown_content,
            template_id=request.template_id,
            template_content=request.template_content
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

