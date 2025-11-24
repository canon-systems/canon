from pydantic import BaseModel
from typing import Optional

class ApplyAIFixRequest(BaseModel):
    doc_id: Optional[str] = None
    markdown_content: Optional[str] = None
    section: Optional[str] = None  # Section to fix (e.g., "Setup", "API")
    issue: Optional[str] = None  # Description of the issue
    instruction: Optional[str] = None  # Generic instruction (e.g., "proofread for grammar")
    model: Optional[str] = None

class ApplyAIFixResponse(BaseModel):
    markdown: str
    fixed_section: Optional[str] = None

