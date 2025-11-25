from pydantic_settings import BaseSettings
from typing import List, Optional, Union
from pydantic import field_validator
import json
import os

class Settings(BaseSettings):
    # Environment Configuration
    # Set to "production" or "development" (defaults to "development")
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    
    # API Configuration
    API_V1_PREFIX: str = "/api"
    
    # CORS - Read from environment variable (JSON array string) or use defaults
    # Environment variable should be a JSON array string, e.g., '["http://localhost:3000","https://app.example.com"]'
    # Or comma-separated: "http://localhost:3000,https://app.example.com"
    # Note: "*" in the list will allow all origins (useful for Postman)
    CORS_ORIGINS: Union[List[str], str] = ["http://localhost:3000", "http://localhost:3001", "http://localhost:8000"]
    
    # Supabase - Environment variables take priority over defaults
    SUPABASE_URL: str = "https://gghrmzcynkrfczobuqmv.supabase.co"
    SUPABASE_SERVICE_KEY: str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdnaHJtemN5bmtyZmN6b2J1cW12Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDc1OTY1NywiZXhwIjoyMDcwMzM1NjU3fQ.f-58mcS8u8uIS80ZU8xYkMccaM-OE1D15ls7wvXUD3Q"
    SUPABASE_ANON_KEY: str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdnaHJtemN5bmtyZmN6b2J1cW12Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3NTk2NTcsImV4cCI6MjA3MDMzNTY1N30.FfV4QX7KXe_uRBV5r_j54QiRwREIEqNXjXRs1bofrEA"
    
    # Nango - Environment variables take priority over defaults
    NANGO_SECRET_KEY: str = "17ff3e70-5799-48dd-a5f4-08efdf787aeb"
    NANGO_HOST: str = "https://api.nango.dev"
    
    # LLM Gateway - Environment variables take priority over defaults
    VERCEL_AI_GATEWAY_URL: str = "https://ai-gateway.vercel.sh/v1"
    VERCEL_AI_GATEWAY_API_KEY: str = "7Iy637Ds6ryr8ef2yFyPyw8e"
    
    # Inngest - Environment variables take priority over defaults
    INNGEST_EVENT_KEY: str = "CxrbldPKxk8B5u0hxR9HqhRbw-t0Wt5dBU3mDMXzBxTXLiNKaaSMlKD16h5-Shyl-Eb7fH9w6Tis_nKcBiuLEw"
    INNGEST_SIGNING_KEY: str = "signkey-prod-09b54bb321bb797657a7641d1035cceb9c08fcfdcbeaf355ca44e2062a29400e"
    # Serve path - The Inngest SDK uses /api/inngest by default
    # This is just for reference in our code, the SDK reads from environment automatically
    INNGEST_SERVE_PATH: str = "/api/inngest"
    # Serve host - Set this environment variable in Render for production
    # The Inngest Python SDK automatically reads INNGEST_SERVE_HOST from environment
    # Format: https://dev-dohg.onrender.com (no trailing slash)
    # If not set, Inngest will auto-detect from request headers (works for development)
    INNGEST_SERVE_HOST: Optional[str] = os.getenv("INNGEST_SERVE_HOST", None)
    INNGEST_DEV_SERVER_URL: str = "http://localhost:8288"
    
    @field_validator('CORS_ORIGINS', mode='before')
    @classmethod
    def parse_cors_origins(cls, v):
        """Parse CORS_ORIGINS from environment variable or use provided value"""
        # If it's already a list, return it
        if isinstance(v, list):
            return v
        
        # If it's a string, try to parse it
        if isinstance(v, str):
            # Try JSON first
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return parsed
            except (json.JSONDecodeError, ValueError):
                pass
            
            # If not JSON, treat as comma-separated
            origins = [origin.strip() for origin in v.split(",") if origin.strip()]
            if origins:
                return origins
        
        # Fallback to default
        return v
    
    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()

