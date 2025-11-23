"""
Coda Workspace Provider
"""
from typing import Optional, Dict, Any
from app.services.workspace.base import WorkspaceProvider, WorkspaceInfo, WorkspaceContent
from app.core.nango import NangoClient
import markdown

class CodaProvider(WorkspaceProvider):
    """Coda workspace provider implementation"""
    
    def __init__(self, supabase):
        self.supabase = supabase
        self.nango = NangoClient()
    
    @property
    def name(self) -> str:
        return 'coda'
    
    async def pull_content(
        self,
        workspace_info: WorkspaceInfo,
        connection_id: str
    ) -> Optional[WorkspaceContent]:
        """Pull content from Coda doc"""
        # TODO: Implement Coda pull
        print('Coda pull not yet implemented')
        return None
    
    async def push_content(
        self,
        workspace_info: WorkspaceInfo,
        content: WorkspaceContent,
        connection_id: str,
        create_new: bool = True
    ) -> Optional[WorkspaceInfo]:
        """Push content to Coda"""
        try:
            if create_new:
                # Create new Coda doc
                doc_data = await self.nango.proxy_request(
                    connection_id=connection_id,
                    provider='coda',
                    method='POST',
                    path='/v1/docs',
                    json={'title': content.title}
                )
                
                if not doc_data:
                    return None
                
                doc_id = doc_data.get('id')
                if not doc_id:
                    return None
                
                # Create a page in the doc
                page_data = await self.nango.proxy_request(
                    connection_id=connection_id,
                    provider='coda',
                    method='POST',
                    path=f'/v1/docs/{doc_id}/pages',
                    json={'name': content.title}
                )
                
                if not page_data:
                    return None
                
                page_id = page_data.get('id')
                
                # Insert content into page
                # Coda uses a specific format for content
                html = content.html or markdown.markdown(content.markdown)
                coda_content = self._convert_to_coda_format(html)
                
                await self.nango.proxy_request(
                    connection_id=connection_id,
                    provider='coda',
                    method='POST',
                    path=f'/v1/docs/{doc_id}/pages/{page_id}/content',
                    json={'content': coda_content}
                )
                
                return WorkspaceInfo(
                    provider='coda',
                    resource_id=doc_id,
                    metadata={'page_id': page_id}
                )
            else:
                # Update existing doc
                success = await self.update_content(workspace_info, content, connection_id)
                return workspace_info if success else None
        except Exception as e:
            print(f'Coda push error: {e}')
            return None
    
    async def update_content(
        self,
        workspace_info: WorkspaceInfo,
        content: WorkspaceContent,
        connection_id: str
    ) -> bool:
        """Update existing Coda doc"""
        try:
            doc_id = workspace_info.resource_id
            page_id = workspace_info.metadata.get('page_id')
            
            if not doc_id or not page_id:
                return False
            
            # Convert markdown to Coda format
            html = content.html or markdown.markdown(content.markdown)
            coda_content = self._convert_to_coda_format(html)
            
            # Update page content
            response = await self.nango.proxy_request(
                connection_id=connection_id,
                provider='coda',
                method='PUT',
                path=f'/v1/docs/{doc_id}/pages/{page_id}/content',
                json={'content': coda_content}
            )
            
            return response is not None
        except Exception as e:
            print(f'Coda update error: {e}')
            return False
    
    def _convert_to_coda_format(self, html: str) -> Dict[str, Any]:
        """Convert HTML to Coda's content format"""
        # Coda uses a JSON structure for content
        # This is a simplified version - full implementation would parse HTML more thoroughly
        return {
            'type': 'richText',
            'content': html  # Simplified - would need proper Coda format conversion
        }

