from pydantic import BaseModel
from typing import Optional, List, Dict, Any


class AnalyzeRepoRequest(BaseModel):
    repo_url: str
    branch: Optional[str] = "master"
    subdir: Optional[str] = None
    filters: Optional[Dict[str, Any]] = None


class FileInfo(BaseModel):
    path: str
    size: int
    language: Optional[str] = None
    hash: Optional[str] = None


class DetectionResult(BaseModel):
    tools: List[Dict[str, Any]]
    connections: List[Dict[str, Any]]
    detected_at: str


class AnalyzeRepoResponse(BaseModel):
    success: bool
    message: str
    files: List[FileInfo]
    languages: List[str]
    detection_result: Optional[DetectionResult] = None
    snapshot: Dict[str, Any]
