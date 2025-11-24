from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api.routes import analyze_repo
from app.api.routes import detect_changes
from app.api.routes import generate_doc
from app.api.routes import generate_diagram
from app.api.routes import apply_template
from app.api.routes import apply_ai_fix
from app.api.routes import get_doc
from app.api.routes import get_diff
from app.api.routes import get_diagram_diff
from app.api.routes import approve_doc
from app.api.routes import reject_doc
from app.api.routes import list_docs
from app.api.routes import repos
from app.api.routes.push import notion
from app.api.routes.push import confluence
from app.api.routes.push import coda
from app.api.routes.push import list_resources
from app.api.routes import automation_job
from app.core.inngest import inngest_client
from app.functions.automation import check_due_rules, execute_automation_rule
import inngest.fast_api

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
app.include_router(get_doc.router, prefix="/api", tags=["docs"])
app.include_router(get_diff.router, prefix="/api", tags=["docs"])
app.include_router(get_diagram_diff.router, prefix="/api", tags=["docs"])
app.include_router(approve_doc.router, prefix="/api", tags=["docs"])
app.include_router(reject_doc.router, prefix="/api", tags=["docs"])
app.include_router(list_docs.router, prefix="/api", tags=["docs"])
app.include_router(repos.router, prefix="/api", tags=["repos"])
app.include_router(notion.router, prefix="/api/push", tags=["push"])
app.include_router(confluence.router, prefix="/api/push", tags=["push"])
app.include_router(coda.router, prefix="/api/push", tags=["push"])
app.include_router(list_resources.router, prefix="/api/push", tags=["push"])
app.include_router(automation_job.router, prefix="/api", tags=["automation"])

# Inngest serve endpoint - Inngest calls this to discover and invoke functions
# Register all Inngest functions
inngest_functions = [
    check_due_rules,
    execute_automation_rule,
]

# Add Inngest serve endpoint
inngest.fast_api.serve(app, inngest_client, inngest_functions)


@app.get("/")
async def root():
    return {"message": "Sync API", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
