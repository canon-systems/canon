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
# Note: Functions decorated with @inngest_client.create_function() are automatically
# registered with the client, but we need to pass them explicitly to serve()
inngest_functions = [
    check_due_rules,
    execute_automation_rule,
]

# Add Inngest serve endpoint
# The serve() function will automatically discover and register all decorated functions
# Functions decorated with @inngest_client.create_function() are automatically registered
# Note: The serve endpoint is created at the default path, but Inngest Cloud will use
# the INNGEST_SERVE_PATH environment variable to know where to call
inngest.fast_api.serve(
    app,
    inngest_client,
    inngest_functions
)


@app.get("/")
async def root():
    return {"message": "Sync API", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/api/inngest/debug")
async def inngest_debug():
    """
    Debug endpoint to check Inngest function registration.
    This helps verify that functions are properly registered.
    """
    try:
        function_info = []
        for func in inngest_functions:
            try:
                func_data = {
                    "type": type(func).__name__,
                    "module": func.__module__ if hasattr(func, '__module__') else "unknown",
                    "name": func.__name__ if hasattr(func, '__name__') else "unknown",
                }
                # Try to get function metadata if available
                if hasattr(func, 'fn_id'):
                    func_data["fn_id"] = func.fn_id
                if hasattr(func, 'name'):
                    func_data["display_name"] = func.name
                if hasattr(func, 'trigger'):
                    func_data["trigger"] = str(func.trigger)
                function_info.append(func_data)
            except Exception as e:
                function_info.append({"error": str(e), "func": str(func)})
        
        return {
            "status": "ok",
            "app_id": inngest_client.app_id,
            "is_production": inngest_client.is_production,
            "event_key_set": bool(inngest_client.event_key),
            "serve_path": settings.INNGEST_SERVE_PATH,
            "environment": settings.ENVIRONMENT,
            "functions_count": len(inngest_functions),
            "functions": function_info
        }
    except Exception as e:
        import traceback
        return {
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc(),
            "serve_path": settings.INNGEST_SERVE_PATH
        }
