from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    # API Configuration
    API_V1_PREFIX: str = "/api"
    
    # CORS - Allow Postman and local frontend
    # Note: "*" in the list will allow all origins (useful for Postman)
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:3001", "http://localhost:8000"]
    
    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""
    SUPABASE_ANON_KEY: str = ""
    
    # Nango
    NANGO_SECRET_KEY: str = ""
    NANGO_HOST: str = "https://api.nango.dev"
    
    # LLM Gateway
    VERCEL_AI_GATEWAY_URL: str = ""
    VERCEL_AI_GATEWAY_API_KEY: str = ""
    LLM_MODEL: str = "gpt-4o-mini"
    
    # GitHub Webhook
    GITHUB_WEBHOOK_SECRET: str = ""
    
    # Inngest
    INNGEST_EVENT_KEY: str = "CxrbldPKxk8B5u0hxR9HqhRbw-t0Wt5dBU3mDMXzBxTXLiNKaaSMlKD16h5-Shyl-Eb7fH9w6Tis_nKcBiuLEw"
    INNGEST_SIGNING_KEY: str = "signkey-prod-09b54bb321bb797657a7641d1035cceb9c08fcfdcbeaf355ca44e2062a29400e"
    INNGEST_SERVE_PATH: str = "/api/inngest"
    INNGEST_DEV_SERVER_URL: str = "http://localhost:8288"
    
    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()

