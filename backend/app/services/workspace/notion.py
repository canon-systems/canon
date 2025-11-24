"""
Notion Workspace Provider
"""
from typing import Optional, Dict, Any, List
from app.services.workspace.base import WorkspaceProvider, WorkspaceInfo, WorkspaceContent
from app.core.nango import NangoClient
from app.utils.markdown_to_notion import markdown_to_notion_blocks
import markdown

class NotionProvider(WorkspaceProvider):
    """Notion workspace provider implementation"""
    
    def __init__(self, supabase):
        self.supabase = supabase
        self.nango = NangoClient()
    
    @property
    def name(self) -> str:
        return 'notion'
    
    async def pull_content(
        self,
        workspace_info: WorkspaceInfo,
        connection_id: str
    ) -> Optional[WorkspaceContent]:
        """Pull content from Notion page"""
        try:
            page_id = workspace_info.resource_id
            if not page_id:
                return None
            
            # Fetch page properties
            page_data = await self.nango.proxy_request(
                connection_id=connection_id,
                provider='notion',
                method='GET',
                path=f'/v1/pages/{page_id}'
            )
            
            if not page_data:
                return None
            
            # Extract title
            title = 'Documentation'
            title_prop = page_data.get('properties', {}).get('title') or page_data.get('properties', {}).get('Name')
            if title_prop and title_prop.get('title'):
                title = self._extract_rich_text(title_prop['title'])
            
            # Fetch all blocks
            blocks = await self._fetch_all_blocks(page_id, connection_id)
            
            # Convert blocks to markdown
            markdown_content = self._blocks_to_markdown(blocks)
            
            return WorkspaceContent(
                title=title,
                markdown=markdown_content,
                metadata={'page_id': page_id, 'blocks_count': len(blocks)}
            )
        except Exception as e:
            print(f'Notion pull error: {e}')
            return None
    
    async def push_content(
        self,
        workspace_info: WorkspaceInfo,
        content: WorkspaceContent,
        connection_id: str,
        create_new: bool = True
    ) -> Optional[WorkspaceInfo]:
        """Push content to Notion"""
        try:
            # Convert markdown to Notion blocks
            html = content.html or markdown.markdown(content.markdown)
            blocks = markdown_to_notion_blocks(html)
            
            if create_new:
                # Create new page
                # Notion requires a parent - can be a page or database
                parent = None
                
                if workspace_info and workspace_info.resource_id:
                    # Use provided parent page or database
                    # Check if it's a database_id or page_id from metadata
                    # Also check if resource_id itself is a database (from the list_resources response)
                    if workspace_info.metadata and workspace_info.metadata.get('database_id'):
                        parent = {'database_id': workspace_info.metadata['database_id']}
                    elif workspace_info.metadata and workspace_info.metadata.get('type') == 'database':
                        parent = {'database_id': workspace_info.resource_id}
                    else:
                        parent = {'page_id': workspace_info.resource_id}
                else:
                    # Try to get user's default workspace by searching for pages
                    # Notion API requires either a page_id or database_id as parent
                    try:
                        # Search for pages in the user's workspace
                        search_response = await self.nango.proxy_request(
                            connection_id=connection_id,
                            provider='notion',
                            method='POST',
                            path='/v1/search',
                            json={
                                'filter': {'property': 'object', 'value': 'page'},
                                'page_size': 1
                            }
                        )
                        
                        if search_response and search_response.get('results'):
                            # Use the first page as parent
                            first_page = search_response['results'][0]
                            parent = {'page_id': first_page.get('id')}
                        else:
                            # Try to find a database instead
                            db_search = await self.nango.proxy_request(
                                connection_id=connection_id,
                                provider='notion',
                                method='POST',
                                path='/v1/search',
                                json={
                                    'filter': {'property': 'object', 'value': 'database'},
                                    'page_size': 1
                                }
                            )
                            
                            if db_search and db_search.get('results'):
                                first_db = db_search['results'][0]
                                parent = {'database_id': first_db.get('id')}
                            else:
                                raise ValueError(
                                    "Notion requires a parent page or database to create a new page. "
                                    "No pages or databases found in your Notion workspace. "
                                    "Please create a page or database in Notion first, or provide a "
                                    "workspace_info with a resource_id (page_id) or metadata with database_id."
                                )
                    except Exception as search_error:
                        # If search fails, provide helpful error
                        raise ValueError(
                            f"Could not find a default workspace in Notion: {str(search_error)}. "
                            "Please provide a workspace_info with a resource_id (page_id) or "
                            "metadata with database_id."
                        )
                
                try:
                    page_data = await self.nango.proxy_request(
                        connection_id=connection_id,
                        provider='notion',
                        method='POST',
                        path='/v1/pages',
                        json={
                            'parent': parent,
                            'properties': {
                                'title': {
                                    'title': [{'text': {'content': content.title}}]
                                }
                            },
                            'children': blocks
                        }
                    )
                except Exception as nango_error:
                    # Re-raise with more context
                    raise Exception(f"Failed to create Notion page: {str(nango_error)}")
                
                if not page_data:
                    raise Exception("Notion API returned no data")
                
                page_id = page_data.get('id')
                if not page_id:
                    raise Exception("Notion API did not return a page ID")
                
                # Get the page URL from the response
                page_url = page_data.get('url') or f"https://notion.so/{page_id.replace('-', '')}"
                
                return WorkspaceInfo(
                    provider='notion',
                    resource_id=page_id,
                    metadata={
                        **(workspace_info.metadata or {}),
                        'url': page_url
                    }
                )
            else:
                # Update existing page
                if not workspace_info or not workspace_info.resource_id:
                    raise ValueError("workspace_info.resource_id is required for updating")
                success = await self.update_content(workspace_info, content, connection_id)
                return workspace_info if success else None
        except ValueError as e:
            # Re-raise ValueError so it can be caught as a 400 error
            raise
        except Exception as e:
            error_msg = str(e)
            print(f'Notion push error: {error_msg}')
            raise Exception(f"Failed to push to Notion: {error_msg}")
    
    async def update_content(
        self,
        workspace_info: WorkspaceInfo,
        content: WorkspaceContent,
        connection_id: str
    ) -> bool:
        """Update existing Notion page"""
        try:
            page_id = workspace_info.resource_id
            
            # Convert markdown to Notion blocks
            html = content.html or markdown.markdown(content.markdown)
            blocks = markdown_to_notion_blocks(html)
            
            # Delete existing blocks
            existing_blocks = await self._fetch_all_blocks(page_id, connection_id)
            for block in existing_blocks:
                await self.nango.proxy_request(
                    connection_id=connection_id,
                    provider='notion',
                    method='DELETE',
                    path=f'/v1/blocks/{block.get("id")}'
                )
            
            # Update title
            await self.nango.proxy_request(
                connection_id=connection_id,
                provider='notion',
                method='PATCH',
                path=f'/v1/pages/{page_id}',
                json={
                    'properties': {
                        'title': {
                            'title': [{'text': {'content': content.title}}]
                        }
                    }
                }
            )
            
            # Add new blocks
            if blocks:
                await self.nango.proxy_request(
                    connection_id=connection_id,
                    provider='notion',
                    method='PATCH',
                    path=f'/v1/blocks/{page_id}/children',
                    json={'children': blocks}
                )
            
            return True
        except Exception as e:
            print(f'Notion update error: {e}')
            return False
    
    async def _fetch_all_blocks(self, page_id: str, connection_id: str) -> List[Dict[str, Any]]:
        """Fetch all blocks from a Notion page (recursively)"""
        all_blocks = []
        next_cursor = None
        
        while True:
            params = {}
            if next_cursor:
                params['start_cursor'] = next_cursor
            
            response = await self.nango.proxy_request(
                connection_id=connection_id,
                provider='notion',
                method='GET',
                path=f'/v1/blocks/{page_id}/children',
                params=params
            )
            
            if not response:
                break
            
            blocks = response.get('results', [])
            all_blocks.extend(blocks)
            
            # Fetch children for each block
            for block in blocks:
                if block.get('has_children') and block.get('id'):
                    children = await self._fetch_all_blocks(block['id'], connection_id)
                    block['children'] = children
            
            next_cursor = response.get('next_cursor')
            if not next_cursor:
                break
        
        return all_blocks
    
    def _blocks_to_markdown(self, blocks: List[Dict[str, Any]]) -> str:
        """Convert Notion blocks to markdown"""
        markdown_parts = []
        
        for block in blocks:
            if not block or block.get('type') == 'unsupported':
                continue
            
            block_type = block.get('type')
            
            if block_type == 'paragraph':
                text = self._extract_rich_text(block.get('paragraph', {}).get('rich_text', []))
                if text:
                    markdown_parts.append(text)
            elif block_type == 'heading_1':
                text = self._extract_rich_text(block.get('heading_1', {}).get('rich_text', []))
                if text:
                    markdown_parts.append(f'# {text}')
            elif block_type == 'heading_2':
                text = self._extract_rich_text(block.get('heading_2', {}).get('rich_text', []))
                if text:
                    markdown_parts.append(f'## {text}')
            elif block_type == 'heading_3':
                text = self._extract_rich_text(block.get('heading_3', {}).get('rich_text', []))
                if text:
                    markdown_parts.append(f'### {text}')
            elif block_type == 'bulleted_list_item':
                text = self._extract_rich_text(block.get('bulleted_list_item', {}).get('rich_text', []))
                if text:
                    markdown_parts.append(f'- {text}')
            elif block_type == 'numbered_list_item':
                text = self._extract_rich_text(block.get('numbered_list_item', {}).get('rich_text', []))
                if text:
                    markdown_parts.append(f'1. {text}')
            elif block_type == 'code':
                code_text = self._extract_rich_text(block.get('code', {}).get('rich_text', []))
                language = block.get('code', {}).get('language', '')
                if code_text:
                    markdown_parts.append(f'```{language}\n{code_text}\n```')
            elif block_type == 'quote':
                text = self._extract_rich_text(block.get('quote', {}).get('rich_text', []))
                if text:
                    markdown_parts.append(f'> {text}')
            elif block_type == 'divider':
                markdown_parts.append('---')
            
            # Process children
            if block.get('children'):
                child_markdown = self._blocks_to_markdown(block['children'])
                if child_markdown:
                    markdown_parts.append(child_markdown)
        
        return '\n\n'.join(filter(None, markdown_parts))
    
    def _extract_rich_text(self, rich_text: List[Dict[str, Any]]) -> str:
        """Extract plain text from Notion rich text array"""
        return ''.join([
            item.get('text', {}).get('content', '')
            for item in rich_text
            if item.get('type') == 'text'
        ])

