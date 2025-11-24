from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class FileInput(BaseModel):
    path: str
    content: str

class DocumentStructureConfig(BaseModel):
    sections: Optional[List[Dict[str, Any]]] = None
    include_table_of_contents: Optional[bool] = False
    custom_structure: Optional[str] = None

class PromptConfig(BaseModel):
    personality: Optional[str] = None
    style: Optional[str] = None
    custom_instructions: Optional[str] = None
    temperature: Optional[float] = None
    document_structure: Optional[DocumentStructureConfig] = None

class GenerateDocRequest(BaseModel):
    project_name: str = "Project"
    files: Optional[List[FileInput]] = None
    repo_url: Optional[str] = None
    branch: Optional[str] = "main"
    subdir: Optional[str] = None
    model: Optional[str] = None
    prompt_config: Optional[PromptConfig] = None

class GenerateDocResponse(BaseModel):
    markdown: str
    model: Optional[str] = None
    prompt_config: Optional[PromptConfig] = None

