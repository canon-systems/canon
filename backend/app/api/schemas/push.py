from pydantic import BaseModel
from typing import Optional, Dict, Any

class WorkspaceInfo(BaseModel):
    provider: str
    resource_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class PushRequest(BaseModel):
    doc_id: Optional[str] = None
    title: str
    markdown: str
    workspace_info: Optional[WorkspaceInfo] = None
    create_new: bool = True

class PushResponse(BaseModel):
    success: bool
    resource_id: Optional[str] = None
    url: Optional[str] = None
    workspace_info: Optional[WorkspaceInfo] = None
    message: Optional[str] = None

