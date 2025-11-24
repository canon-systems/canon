from fastapi import APIRouter, Depends, HTTPException
from app.api.schemas.doc import GenerateDocRequest, GenerateDocResponse
from app.services.doc_generator import generate_documentation
from app.core.auth import get_optional_user
from app.core.database import get_supabase
from supabase import Client
from typing import Optional

router = APIRouter()

@router.post("/generate-doc", response_model=GenerateDocResponse)
async def generate_doc_endpoint(
    request: GenerateDocRequest,
    user: Optional[dict] = Depends(get_optional_user),
    supabase: Client = Depends(get_supabase)
):
    """
    Generate documentation content (in markdown form) from source code input.
    Does not save to database - just returns the generated markdown.
    """
    try:
        if not request.files and not request.repo_url:
            raise HTTPException(
                status_code=400,
                detail="Either 'files' or 'repo_url' must be provided"
            )
        
        result = await generate_documentation(
            supabase=supabase,
            user_id=user["id"] if user else None,
            project_name=request.project_name,
            model=request.model,
            files=[{"path": f.path, "content": f.content} for f in request.files] if request.files else None,
            repo_url=request.repo_url,
            branch=request.branch,
            subdir=request.subdir,
            prompt_config=request.prompt_config.model_dump() if request.prompt_config else None
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

