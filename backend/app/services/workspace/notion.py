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
                parent_page_id = workspace_info.resource_id
                
                page_data = await self.nango.proxy_request(
                    connection_id=connection_id,
                    provider='notion',
                    method='POST',
                    path='/v1/pages',
                    json={
                        'parent': {'page_id': parent_page_id},
                        'properties': {
                            'title': {
                                'title': [{'text': {'content': content.title}}]
                            }
                        },
                        'children': blocks
                    }
                )
                
                if not page_data:
                    return None
                
                return WorkspaceInfo(
                    provider='notion',
                    resource_id=page_data.get('id'),
                    metadata=workspace_info.metadata
                )
            else:
                # Update existing page
                success = await self.update_content(workspace_info, content, connection_id)
                return workspace_info if success else None
        except Exception as e:
            print(f'Notion push error: {e}')
            return None
    
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

