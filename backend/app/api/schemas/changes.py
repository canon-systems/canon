from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class DetectChangesRequest(BaseModel):
    repo_url: Optional[str] = None
    branch: Optional[str] = "main"
    commit_range: Optional[str] = None
    submission_id: Optional[str] = None  # For doc submissions
    diagram_id: Optional[str] = None  # For architecture diagrams

class FileChange(BaseModel):
    path: str
    old_hash: Optional[str] = None
    new_hash: Optional[str] = None
    status: str  # "added", "modified", "removed"

class ArchitectureChange(BaseModel):
    tools_added: List[str]
    tools_removed: List[str]
    connections_added: List[Dict[str, str]]
    connections_removed: List[Dict[str, str]]

class DetectChangesResponse(BaseModel):
    has_changes: bool
    commit_changed: bool
    files_changed: List[FileChange]
    files_added: List[str]
    files_removed: List[str]
    architecture_changes: Optional[ArchitectureChange] = None
    summary: str
    current_commit_sha: Optional[str] = None
    old_commit_sha: Optional[str] = None

