from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    # API Configuration
    API_V1_PREFIX: str = "/api"
    
    # CORS - Allow Postman and local frontend
    # Note: "*" in the list will allow all origins (useful for Postman)
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:3001", "http://localhost:8000"]
    
    # Supabase
    SUPABASE_URL: str = "https://gghrmzcynkrfczobuqmv.supabase.co"
    SUPABASE_SERVICE_KEY: str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdnaHJtemN5bmtyZmN6b2J1cW12Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDc1OTY1NywiZXhwIjoyMDcwMzM1NjU3fQ.f-58mcS8u8uIS80ZU8xYkMccaM-OE1D15ls7wvXUD3Q"
    SUPABASE_ANON_KEY: str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdnaHJtemN5bmtyZmN6b2J1cW12Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3NTk2NTcsImV4cCI6MjA3MDMzNTY1N30.FfV4QX7KXe_uRBV5r_j54QiRwREIEqNXjXRs1bofrEA"
    
    # Nango
    NANGO_SECRET_KEY: str = "17ff3e70-5799-48dd-a5f4-08efdf787aeb"
    NANGO_HOST: str = "https://api.nango.dev"
    
    # LLM Gateway
    VERCEL_AI_GATEWAY_URL: str = "https://ai-gateway.vercel.sh/v1"
    VERCEL_AI_GATEWAY_API_KEY: str = "7Iy637Ds6ryr8ef2yFyPyw8e"
    
    # Inngest
    INNGEST_EVENT_KEY: str = "CxrbldPKxk8B5u0hxR9HqhRbw-t0Wt5dBU3mDMXzBxTXLiNKaaSMlKD16h5-Shyl-Eb7fH9w6Tis_nKcBiuLEw"
    INNGEST_SIGNING_KEY: str = "signkey-prod-09b54bb321bb797657a7641d1035cceb9c08fcfdcbeaf355ca44e2062a29400e"
    INNGEST_SERVE_PATH: str = "/api/inngest"
    INNGEST_DEV_SERVER_URL: str = "http://localhost:8288"
    
    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()

