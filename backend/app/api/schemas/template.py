from pydantic import BaseModel
from typing import Optional

class ApplyTemplateRequest(BaseModel):
    doc_id: Optional[str] = None
    markdown_content: Optional[str] = None
    template_id: Optional[str] = None
    template_content: Optional[str] = None

class ApplyTemplateResponse(BaseModel):
    markdown: str
    template_applied: str
    changes_summary: Optional[str] = None

