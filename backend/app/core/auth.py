"""
Authentication utilities
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.database import get_supabase, get_supabase_with_auth
from supabase import Client
from typing import Optional

# Security scheme for required authentication
security = HTTPBearer()

# Security scheme for optional authentication (allows requests without header)
optional_security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    supabase: Client = Depends(get_supabase),
) -> dict:
    """Get current authenticated user from JWT token"""
    try:
        token = credentials.credentials

        # Verify token with Supabase
        auth_supabase = get_supabase_with_auth(token)
        user_response = auth_supabase.auth.get_user(token)

        if not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
            )

        return {
            "id": user_response.user.id,
            "email": user_response.user.email,
            "user_metadata": user_response.user.user_metadata,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
    supabase: Client = Depends(get_supabase),
) -> Optional[dict]:
    """Get user if authenticated, otherwise return None"""
    if not credentials:
        return None
    try:
        return await get_current_user(credentials, supabase)
    except:
        return None
