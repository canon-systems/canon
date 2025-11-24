"""
Base workspace provider interface
"""
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
from pydantic import BaseModel

class WorkspaceInfo(BaseModel):
    """Workspace connection information"""
    provider: str
    resource_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class WorkspaceContent(BaseModel):
    """Content to push/pull from workspace"""
    title: str
    markdown: str
    html: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class WorkspaceProvider(ABC):
    """Base class for workspace providers"""
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Provider name (e.g., 'notion', 'confluence', 'coda')"""
        pass
    
    @abstractmethod
    async def pull_content(
        self,
        workspace_info: WorkspaceInfo,
        connection_id: str
    ) -> Optional[WorkspaceContent]:
        """Pull content from workspace"""
        pass
    
    @abstractmethod
    async def push_content(
        self,
        workspace_info: WorkspaceInfo,
        content: WorkspaceContent,
        connection_id: str,
        create_new: bool = True
    ) -> Optional[WorkspaceInfo]:
        """Push/update content to workspace"""
        pass
    
    @abstractmethod
    async def update_content(
        self,
        workspace_info: WorkspaceInfo,
        content: WorkspaceContent,
        connection_id: str
    ) -> bool:
        """Update existing content in workspace"""
        pass

