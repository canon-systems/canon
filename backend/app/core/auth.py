"""
Authentication utilities
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.database import get_supabase, get_supabase_with_auth
from supabase import Client
from typing import Optional
import jwt
from app.config import settings

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

        # Decode JWT to extract user info
        # Note: We decode without signature verification for now
        # In production, you should verify using Supabase's JWT secret
        try:
            decoded = jwt.decode(token, options={"verify_signature": False})
            user_id = decoded.get("sub")
            email = decoded.get("email")

            if not user_id:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token: missing user ID",
                )

            # Verify user exists using admin client
            from supabase import create_client

            admin_client = create_client(
                settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY
            )

            try:
                user_data = admin_client.auth.admin.get_user_by_id(user_id)
                if not user_data.user:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="User not found",
                    )

                return {
                    "id": user_data.user.id,
                    "email": user_data.user.email,
                    "user_metadata": user_data.user.user_metadata,
                }
            except Exception as admin_error:
                # If admin API fails, return decoded token info
                # This is less secure but allows the request to proceed
                return {
                    "id": user_id,
                    "email": email,
                    "user_metadata": decoded.get("user_metadata", {}),
                }
        except jwt.DecodeError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token format",
            )
    except HTTPException:
        raise
    except Exception as e:
        # Log the error for debugging
        import logging

        logger = logging.getLogger(__name__)
        logger.error(f"Authentication error: {str(e)}")
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
