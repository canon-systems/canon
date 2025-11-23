from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class FileInput(BaseModel):
    path: str
    content: str

class GenerateDiagramRequest(BaseModel):
    method: str  # "github" or "zip" or "files"
    repo_url: Optional[str] = None
    branch: Optional[str] = "main"
    subdir: Optional[str] = None
    files: Optional[List[FileInput]] = None
    save_diagram: bool = False
    title: str = "Untitled Diagram"
    description: Optional[str] = None

class DetectedTool(BaseModel):
    name: str
    category: str  # "internal" or "external"
    icon: str
    description: str
    source: str
    file: Optional[str] = None

class DetectionResult(BaseModel):
    tools: List[DetectedTool]
    connections: List[Dict[str, str]]
    detected_at: str

class GenerateDiagramResponse(BaseModel):
    diagram: str  # Mermaid markdown
    tools: DetectionResult
    file_count: int
    saved: bool = False
    diagram_id: Optional[str] = None
    is_new_diagram: bool = False

