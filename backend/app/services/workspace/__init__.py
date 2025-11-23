"""
Workspace providers factory
"""
from typing import Optional, List
from supabase import Client
from .base import WorkspaceProvider
from .notion import NotionProvider
from .confluence import ConfluenceProvider
from .coda import CodaProvider

def get_workspace_provider(provider_name: str, supabase: Client) -> Optional[WorkspaceProvider]:
    """Get workspace provider by name"""
    providers = {
        'notion': NotionProvider,
        'confluence': ConfluenceProvider,
        'coda': CodaProvider
    }
    
    provider_class = providers.get(provider_name.lower())
    if provider_class:
        return provider_class(supabase)
    return None

def list_workspace_providers() -> List[str]:
    """List all available workspace providers"""
    return ['notion', 'confluence', 'coda']

