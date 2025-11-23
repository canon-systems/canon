from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api.routes import analyze_repo
from app.api.routes import detect_changes
from app.api.routes import generate_doc
from app.api.routes import generate_diagram
from app.api.routes import apply_template
from app.api.routes import apply_ai_fix
from app.api.routes.push import notion
from app.api.routes.push import confluence
from app.api.routes.push import coda
from app.api.routes.push import list_resources

app = FastAPI(
    title="Sync API",
    description="Backend API for code documentation and architecture analysis",
    version="1.0.0",
)

# CORS middleware
# Handle "*" in CORS_ORIGINS for Postman testing
cors_origins = settings.CORS_ORIGINS
allow_all_origins = "*" in cors_origins

if allow_all_origins:
    # Filter out "*" and allow all origins
    cors_origins = ["*"]
    allow_credentials = False
else:
    allow_credentials = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(analyze_repo.router, prefix="/api", tags=["analyze"])
app.include_router(detect_changes.router, prefix="/api", tags=["changes"])
app.include_router(generate_doc.router, prefix="/api", tags=["docs"])
app.include_router(generate_diagram.router, prefix="/api", tags=["diagrams"])
app.include_router(apply_template.router, prefix="/api", tags=["templates"])
app.include_router(apply_ai_fix.router, prefix="/api", tags=["ai-fix"])
app.include_router(notion.router, prefix="/api/push", tags=["push"])
app.include_router(confluence.router, prefix="/api/push", tags=["push"])
app.include_router(coda.router, prefix="/api/push", tags=["push"])
app.include_router(list_resources.router, prefix="/api/push", tags=["push"])


@app.get("/")
async def root():
    return {"message": "Sync API", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
