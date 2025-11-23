"""
Database utilities - Supabase client
"""
from supabase import create_client, Client
from app.config import settings
from functools import lru_cache

@lru_cache()
def get_supabase() -> Client:
    """Get Supabase client singleton"""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

def get_supabase_with_auth(token: str) -> Client:
    """Get Supabase client with user authentication token"""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY, {
        'headers': {
            'Authorization': f'Bearer {token}'
        }
    })

