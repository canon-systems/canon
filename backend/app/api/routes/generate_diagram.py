from fastapi import APIRouter, Depends, HTTPException, Form, File, UploadFile
from app.api.schemas.diagram import (
    GenerateDiagramRequest,
    GenerateDiagramResponse,
)
from app.services.diagram_generator import generate_architecture_diagram
from app.core.auth import get_optional_user
from app.core.database import get_supabase
from supabase import Client
from typing import Optional

router = APIRouter()

@router.post("/generate-diagram", response_model=GenerateDiagramResponse)
async def generate_diagram_endpoint(
    request: Optional[GenerateDiagramRequest] = None,
    method: Optional[str] = Form(None),
    repo_url: Optional[str] = Form(None),
    branch: Optional[str] = Form(None),
    subdir: Optional[str] = Form(None),
    save_diagram: Optional[bool] = Form(False),
    title: Optional[str] = Form("Untitled Diagram"),
    description: Optional[str] = Form(None),
    zip_file: Optional[UploadFile] = File(None),
    user: Optional[dict] = Depends(get_optional_user),
    supabase: Client = Depends(get_supabase)
):
    """
    Generate or update an architecture diagram for a repository.
    Supports GitHub repos and ZIP file uploads.
    """
    try:
        # Handle form data (for file uploads) or JSON body
        if method == "github" or (repo_url and not request):
            if not repo_url:
                raise HTTPException(status_code=400, detail="repo_url is required")
            
            result = await generate_architecture_diagram(
                supabase=supabase,
                user_id=user["id"] if user and save_diagram else None,
                method="github",
                repo_url=repo_url,
                branch=branch or "main",
                subdir=subdir,
                save_diagram=save_diagram,
                title=title,
                description=description
            )
        elif method == "zip" or zip_file:
            if not zip_file:
                raise HTTPException(status_code=400, detail="zip_file is required")
            
            zip_content = await zip_file.read()
            result = await generate_architecture_diagram(
                supabase=supabase,
                user_id=user["id"] if user and save_diagram else None,
                method="zip",
                zip_content=zip_content,
                save_diagram=save_diagram,
                title=title,
                description=description
            )
        elif request:
            # JSON body request
            result = await generate_architecture_diagram(
                supabase=supabase,
                user_id=user["id"] if user and request.save_diagram else None,
                method=request.method,
                repo_url=request.repo_url,
                branch=request.branch,
                subdir=request.subdir,
                files=[{"path": f.path, "content": f.content} for f in request.files] if request.files else None,
                save_diagram=request.save_diagram,
                title=request.title,
                description=request.description
            )
        else:
            raise HTTPException(
                status_code=400,
                detail="Either provide repo_url (for GitHub) or zip_file (for ZIP upload)"
            )
        
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

