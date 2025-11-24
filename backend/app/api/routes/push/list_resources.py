"""
List available resources (pages, databases, etc.) for workspace providers
"""
from fastapi import APIRouter, Depends, HTTPException
from app.core.auth import get_current_user
from app.core.database import get_supabase
from app.services.workspace import get_workspace_provider
from supabase import Client
from typing import List, Dict, Any

router = APIRouter()

@router.get("/{provider}/resources")
async def list_resources(
    provider: str,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    """
    List available resources (pages, databases, spaces, etc.) for a provider
    """
    try:
        # Get user's connection
        connection = supabase.table('oauth_connections').select('connection_id').eq(
            'user_id', user['id']
        ).eq('provider', provider).eq('status', 'active').single().execute()
        
        if not connection.data:
            raise ValueError(f"No active {provider} connection found for user")
        
        connection_id = connection.data['connection_id']
        
        # Get workspace provider
        workspace_provider = get_workspace_provider(provider, supabase)
        if not workspace_provider:
            raise ValueError(f"{provider} provider not available")
        
        # List resources based on provider
        if provider == 'notion':
            resources = await _list_notion_resources(workspace_provider, connection_id)
        elif provider == 'confluence':
            resources = await _list_confluence_resources(workspace_provider, connection_id)
        elif provider == 'coda':
            resources = await _list_coda_resources(workspace_provider, connection_id)
        else:
            raise ValueError(f"Unknown provider: {provider}")
        
        return {
            'success': True,
            'resources': resources
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _list_notion_resources(provider, connection_id: str) -> List[Dict[str, Any]]:
    """List Notion pages and databases"""
    resources = []
    
    try:
        # Search for pages
        pages_response = await provider.nango.proxy_request(
            connection_id=connection_id,
            provider='notion',
            method='POST',
            path='/v1/search',
            json={
                'filter': {'property': 'object', 'value': 'page'},
                'page_size': 100
            }
        )
        
        if pages_response and pages_response.get('results'):
            for page in pages_response['results']:
                # Extract title
                title = 'Untitled'
                props = page.get('properties', {})
                title_prop = props.get('title') or props.get('Name')
                if title_prop and title_prop.get('title'):
                    title = ''.join([t.get('text', {}).get('content', '') for t in title_prop['title']])
                
                resources.append({
                    'id': page.get('id'),
                    'type': 'page',
                    'title': title or 'Untitled',
                    'url': page.get('url')
                })
        
        # Search for databases
        databases_response = await provider.nango.proxy_request(
            connection_id=connection_id,
            provider='notion',
            method='POST',
            path='/v1/search',
            json={
                'filter': {'property': 'object', 'value': 'database'},
                'page_size': 100
            }
        )
        
        if databases_response and databases_response.get('results'):
            for db in databases_response['results']:
                # Extract title
                title = 'Untitled Database'
                title_prop = db.get('title', [])
                if title_prop:
                    title = ''.join([t.get('text', {}).get('content', '') for t in title_prop])
                
                resources.append({
                    'id': db.get('id'),
                    'type': 'database',
                    'title': title or 'Untitled Database',
                    'url': db.get('url')
                })
    except Exception as e:
        print(f'Error listing Notion resources: {e}')
    
    return resources


async def _list_confluence_resources(provider, connection_id: str) -> List[Dict[str, Any]]:
    """List Confluence spaces"""
    resources = []
    
    try:
        # Get cloud ID first
        cloud_id = await provider._get_cloud_id(connection_id)
        if not cloud_id:
            return resources
        
        # List spaces
        spaces_response = await provider.nango.proxy_request(
            connection_id=connection_id,
            provider='confluence',
            method='GET',
            path=f'/ex/confluence/{cloud_id}/wiki/rest/api/space',
            params={'limit': 100},
            base_url_override='https://api.atlassian.com'
        )
        
        if spaces_response and spaces_response.get('results'):
            for space in spaces_response['results']:
                resources.append({
                    'id': space.get('key'),
                    'type': 'space',
                    'title': space.get('name', space.get('key')),
                    'url': space.get('_links', {}).get('webui')
                })
    except Exception as e:
        print(f'Error listing Confluence resources: {e}')
    
    return resources


async def _list_coda_resources(provider, connection_id: str) -> List[Dict[str, Any]]:
    """List Coda docs"""
    resources = []
    
    try:
        # List docs
        docs_response = await provider.nango.proxy_request(
            connection_id=connection_id,
            provider='coda',
            method='GET',
            path='/v1/docs',
            params={'limit': 100}
        )
        
        if docs_response and docs_response.get('items'):
            for doc in docs_response['items']:
                resources.append({
                    'id': doc.get('id'),
                    'type': 'doc',
                    'title': doc.get('name', 'Untitled'),
                    'url': doc.get('browserLink')
                })
    except Exception as e:
        print(f'Error listing Coda resources: {e}')
    
    return resources

