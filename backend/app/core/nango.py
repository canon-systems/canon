"""
Nango OAuth Integration Client
"""
import httpx
from typing import Optional, Dict, Any
from app.config import settings

class NangoClient:
    """Client for interacting with Nango OAuth proxy"""
    
    def __init__(self):
        self.host = settings.NANGO_HOST.rstrip('/')
        self.secret_key = settings.NANGO_SECRET_KEY
    
    async def get_connection(self, connection_id: str, provider: str) -> Optional[Dict[str, Any]]:
        """Get connection details from Nango"""
        url = f"{self.host}/connection/{connection_id}"
        params = {'provider_config_key': provider}
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers={
                    'Authorization': f'Bearer {self.secret_key}',
                    'Content-Type': 'application/json'
                },
                params=params
            )
            
            if response.is_success:
                return response.json()
        return None
    
    async def get_access_token(self, connection_id: str, provider: str) -> Optional[str]:
        """Get access token for a connection"""
        connection = await self.get_connection(connection_id, provider)
        if connection:
            # Extract token from connection data
            credentials = connection.get('credentials', {})
            return credentials.get('access_token') or connection.get('access_token')
        return None
    
    async def proxy_request(
        self,
        connection_id: str,
        provider: str,
        method: str,
        path: str,
        json: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
        base_url_override: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Make a proxied request through Nango"""
        base_url = base_url_override or self.host
        url = f"{base_url}/proxy{path}" if not path.startswith('/proxy') else f"{base_url}{path}"
        
        headers = {
            'Authorization': f'Bearer {self.secret_key}',
            'Content-Type': 'application/json',
            'Provider-Config-Key': provider,
            'Connection-Id': connection_id
        }
        
        if base_url_override:
            headers['Base-Url-Override'] = base_url_override
        
        async with httpx.AsyncClient() as client:
            if method.upper() == 'GET':
                response = await client.get(url, headers=headers, params=params)
            elif method.upper() == 'POST':
                response = await client.post(url, headers=headers, json=json, params=params)
            elif method.upper() == 'PATCH':
                response = await client.patch(url, headers=headers, json=json, params=params)
            elif method.upper() == 'PUT':
                response = await client.put(url, headers=headers, json=json, params=params)
            elif method.upper() == 'DELETE':
                response = await client.delete(url, headers=headers)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")
            
            if response.is_success:
                content_type = response.headers.get('content-type', '')
                if 'application/json' in content_type:
                    return response.json()
                return {'status': 'success'}
            else:
                # Return error details for better debugging
                error_detail = f"HTTP {response.status_code}"
                try:
                    error_data = response.json()
                    error_detail = error_data.get('message') or error_data.get('error') or str(error_data)
                except:
                    error_detail = response.text or error_detail
                raise Exception(f"Nango proxy request failed: {error_detail}")
        return None


async def get_github_token(connection_id: str) -> Optional[str]:
    """Get GitHub access token for a connection"""
    client = NangoClient()
    return await client.get_access_token(connection_id, 'github')

