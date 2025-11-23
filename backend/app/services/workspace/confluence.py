"""
Confluence Workspace Provider
"""
from typing import Optional, Dict, Any
from app.services.workspace.base import WorkspaceProvider, WorkspaceInfo, WorkspaceContent
from app.core.nango import NangoClient
import markdown
import re

class ConfluenceProvider(WorkspaceProvider):
    """Confluence workspace provider implementation"""
    
    def __init__(self, supabase):
        self.supabase = supabase
        self.nango = NangoClient()
    
    @property
    def name(self) -> str:
        return 'confluence'
    
    async def pull_content(
        self,
        workspace_info: WorkspaceInfo,
        connection_id: str
    ) -> Optional[WorkspaceContent]:
        """Pull content from Confluence page"""
        # TODO: Implement Confluence pull
        print('Confluence pull not yet implemented')
        return None
    
    async def push_content(
        self,
        workspace_info: WorkspaceInfo,
        content: WorkspaceContent,
        connection_id: str,
        create_new: bool = True
    ) -> Optional[WorkspaceInfo]:
        """Push content to Confluence"""
        try:
            # Get cloud ID
            cloud_id = await self._get_cloud_id(connection_id)
            if not cloud_id:
                return None
            
            space_key = workspace_info.metadata.get('spaceKey') or workspace_info.resource_id
            parent_page_id = workspace_info.metadata.get('parentPageId')
            
            # Convert markdown to Confluence storage format
            html = content.html or markdown.markdown(content.markdown)
            confluence_body = self._convert_html_to_confluence_storage(html)
            
            page_data = {
                'type': 'page',
                'title': content.title,
                'space': {'key': space_key},
                'body': {
                    'storage': {
                        'value': confluence_body,
                        'representation': 'storage'
                    }
                }
            }
            
            if parent_page_id:
                page_data['ancestors'] = [{'id': parent_page_id}]
            
            response = await self.nango.proxy_request(
                connection_id=connection_id,
                provider='confluence',
                method='POST',
                path=f'/ex/confluence/{cloud_id}/wiki/rest/api/content',
                json=page_data,
                base_url_override='https://api.atlassian.com'
            )
            
            if not response:
                return None
            
            return WorkspaceInfo(
                provider='confluence',
                resource_id=response.get('id'),
                metadata={
                    'spaceKey': space_key,
                    'cloudId': cloud_id
                }
            )
        except Exception as e:
            print(f'Confluence push error: {e}')
            return None
    
    async def update_content(
        self,
        workspace_info: WorkspaceInfo,
        content: WorkspaceContent,
        connection_id: str
    ) -> bool:
        """Update existing Confluence page"""
        try:
            cloud_id = workspace_info.metadata.get('cloudId')
            if not cloud_id:
                cloud_id = await self._get_cloud_id(connection_id)
                if not cloud_id:
                    return False
            
            page_id = workspace_info.resource_id
            
            # Get current page version
            current_page = await self.nango.proxy_request(
                connection_id=connection_id,
                provider='confluence',
                method='GET',
                path=f'/ex/confluence/{cloud_id}/wiki/rest/api/content/{page_id}',
                base_url_override='https://api.atlassian.com'
            )
            
            if not current_page:
                return False
            
            current_version = current_page.get('version', {}).get('number', 1)
            
            # Convert markdown to Confluence storage format
            html = content.html or markdown.markdown(content.markdown)
            confluence_body = self._convert_html_to_confluence_storage(html)
            
            # Update page
            response = await self.nango.proxy_request(
                connection_id=connection_id,
                provider='confluence',
                method='PUT',
                path=f'/ex/confluence/{cloud_id}/wiki/rest/api/content/{page_id}',
                json={
                    'version': {'number': current_version + 1},
                    'title': content.title,
                    'type': 'page',
                    'body': {
                        'storage': {
                            'value': confluence_body,
                            'representation': 'storage'
                        }
                    }
                },
                base_url_override='https://api.atlassian.com'
            )
            
            return response is not None
        except Exception as e:
            print(f'Confluence update error: {e}')
            return False
    
    async def _get_cloud_id(self, connection_id: str) -> Optional[str]:
        """Get Confluence cloud ID"""
        try:
            response = await self.nango.proxy_request(
                connection_id=connection_id,
                provider='confluence',
                method='GET',
                path='/oauth/token/accessible-resources',
                base_url_override='https://api.atlassian.com'
            )
            
            if response:
                # Response can be array or single object
                if isinstance(response, list) and len(response) > 0:
                    return response[0].get('id')
                elif isinstance(response, dict):
                    return response.get('id')
        except:
            pass
        return None
    
    def _convert_html_to_confluence_storage(self, html: str) -> str:
        """Convert HTML to Confluence storage format"""
        # Basic conversion - replace common HTML tags with Confluence storage format
        confluence_html = html
        confluence_html = re.sub(r'<h1[^>]*>(.*?)</h1>', r'<h1>\1</h1>', confluence_html, flags=re.IGNORECASE | re.DOTALL)
        confluence_html = re.sub(r'<h2[^>]*>(.*?)</h2>', r'<h2>\1</h2>', confluence_html, flags=re.IGNORECASE | re.DOTALL)
        confluence_html = re.sub(r'<h3[^>]*>(.*?)</h3>', r'<h3>\1</h3>', confluence_html, flags=re.IGNORECASE | re.DOTALL)
        confluence_html = re.sub(r'<strong[^>]*>(.*?)</strong>', r'<strong>\1</strong>', confluence_html, flags=re.IGNORECASE | re.DOTALL)
        confluence_html = re.sub(r'<b[^>]*>(.*?)</b>', r'<strong>\1</strong>', confluence_html, flags=re.IGNORECASE | re.DOTALL)
        confluence_html = re.sub(r'<em[^>]*>(.*?)</em>', r'<em>\1</em>', confluence_html, flags=re.IGNORECASE | re.DOTALL)
        confluence_html = re.sub(r'<i[^>]*>(.*?)</i>', r'<em>\1</em>', confluence_html, flags=re.IGNORECASE | re.DOTALL)
        confluence_html = re.sub(r'<code[^>]*>(.*?)</code>', r'<code>\1</code>', confluence_html, flags=re.IGNORECASE | re.DOTALL)
        confluence_html = re.sub(r'<a[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', r'<a href="\1">\2</a>', confluence_html, flags=re.IGNORECASE | re.DOTALL)
        confluence_html = re.sub(r'<ul[^>]*>', r'<ul>', confluence_html, flags=re.IGNORECASE)
        confluence_html = re.sub(r'<ol[^>]*>', r'<ol>', confluence_html, flags=re.IGNORECASE)
        confluence_html = re.sub(r'<li[^>]*>', r'<li>', confluence_html, flags=re.IGNORECASE)
        confluence_html = re.sub(r'<p[^>]*>', r'<p>', confluence_html, flags=re.IGNORECASE)
        confluence_html = re.sub(r'<br\s*/?>', r'<br />', confluence_html, flags=re.IGNORECASE)
        
        return confluence_html

