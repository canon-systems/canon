from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from app.api.schemas.ai_fix import ApplyAIFixRequest, ApplyAIFixResponse
from app.services.ai_fix import apply_ai_fix_to_doc, stream_ai_fix_to_doc
from app.core.auth import get_current_user
from app.core.database import get_supabase
from supabase import Client
import json

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

@router.post("/apply-ai-fix/stream")
async def apply_ai_fix_stream_endpoint(
    request: ApplyAIFixRequest,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    """
    Stream AI improvements to documentation.
    Returns Server-Sent Events (SSE) with chunks of the improved text.
    """
    async def generate_stream():
        try:
            print(f"AI Fix Stream: Starting stream for model={request.model}, instruction={request.instruction[:50] if request.instruction else None}")
            chunk_count = 0
            async for chunk in stream_ai_fix_to_doc(
                supabase=supabase,
                user_id=user["id"],
                model=request.model,
                doc_id=request.doc_id,
                markdown_content=request.markdown_content,
                section=request.section,
                issue=request.issue,
                instruction=request.instruction
            ):
                chunk_count += 1
                chunk_length = len(chunk) if chunk else 0
                print(f"AI Fix Stream: Yielding chunk {chunk_count}, length={chunk_length}")
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
            
            print(f"AI Fix Stream: Completed. Total chunks sent: {chunk_count}")
            # Send completion signal
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            error_msg = str(e)
            import traceback
            print(f"Error in stream_ai_fix_to_doc: {error_msg}")
            print(traceback.format_exc())
            yield f"data: {json.dumps({'error': error_msg})}\n\n"
    
    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

