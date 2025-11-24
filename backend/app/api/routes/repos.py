from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from app.core.auth import get_current_user
from app.core.database import get_supabase
from supabase import Client
from datetime import datetime
from app.services.repo_analyzer import analyze_repository
from app.services.doc_generator import generate_documentation
from app.services.diagram_generator import generate_architecture_diagram
from app.utils.usage_tracking import (
    track_repo_scan,
    track_doc_generated,
    track_diagram_generated
)

router = APIRouter()

class CreateRepoRequest(BaseModel):
    name: str
    provider: str = "github"
    repo_url: str
    default_branch: str = "main"
    auth_type: str = "github_pat"  # or 'none', 'nango_connection'
    credentials_ref: Optional[str] = None  # PAT token or Nango connection ID
    settings: Optional[Dict[str, Any]] = None  # JSON for paths, ignore patterns

class AnalyzeRepoRequest(BaseModel):
    generate_diagram: bool = False

class RepoResponse(BaseModel):
    id: str
    workspace_id: str
    name: str
    provider: str
    repo_url: str
    default_branch: str
    auth_type: str
    credentials_ref: Optional[str]
    settings: Optional[Dict[str, Any]]
    created_at: str
    updated_at: str

@router.post("/repos", response_model=RepoResponse)
async def create_repo(
    request: CreateRepoRequest,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    """
    Create a repository configuration for this workspace.
    """
    try:
        # For now, use user_id as workspace_id (single-user workspace)
        # In a multi-tenant system, you'd have a separate workspaces table
        workspace_id = user['id']
        
        # Insert into workspace_repos table
        try:
            result = supabase.table('workspace_repos').insert({
            'workspace_id': workspace_id,
            'name': request.name,
            'provider': request.provider,
            'repo_url': request.repo_url,
            'default_branch': request.default_branch,
            'auth_type': request.auth_type,
            'credentials_ref': request.credentials_ref,
            'settings': request.settings or {},
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }).execute()
        except Exception as e:
            # Table might not exist yet
            if 'relation "workspace_repos" does not exist' in str(e).lower():
                raise HTTPException(
                    status_code=500,
                    detail="workspace_repos table does not exist. Please run the database migration first. See backend/MIGRATION_WORKSPACE_REPOS.md"
                )
            raise
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create repository")
        
        repo = result.data[0]
        return RepoResponse(
            id=repo['id'],
            workspace_id=repo['workspace_id'],
            name=repo['name'],
            provider=repo['provider'],
            repo_url=repo['repo_url'],
            default_branch=repo['default_branch'],
            auth_type=repo['auth_type'],
            credentials_ref=repo.get('credentials_ref'),
            settings=repo.get('settings'),
            created_at=repo['created_at'],
            updated_at=repo['updated_at']
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create repository: {str(e)}")

@router.get("/repos", response_model=List[RepoResponse])
async def list_repos(
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    """
    List all repositories for this workspace.
    """
    try:
        workspace_id = user['id']
        
        result = supabase.table('workspace_repos').select('*').eq(
            'workspace_id', workspace_id
        ).order('created_at', desc=True).execute()
        
        if not result.data:
            return []
        
        return [
            RepoResponse(
                id=repo['id'],
                workspace_id=repo['workspace_id'],
                name=repo['name'],
                provider=repo['provider'],
                repo_url=repo['repo_url'],
                default_branch=repo['default_branch'],
                auth_type=repo['auth_type'],
                credentials_ref=repo.get('credentials_ref'),
                settings=repo.get('settings'),
                created_at=repo['created_at'],
                updated_at=repo['updated_at']
            )
            for repo in result.data
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list repositories: {str(e)}")

@router.get("/repos/{repo_id}", response_model=RepoResponse)
async def get_repo(
    repo_id: str,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    """
    Get a single repository configuration.
    """
    try:
        workspace_id = user['id']
        
        result = supabase.table('workspace_repos').select('*').eq(
            'id', repo_id
        ).eq('workspace_id', workspace_id).single().execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Repository not found")
        
        repo = result.data
        return RepoResponse(
            id=repo['id'],
            workspace_id=repo['workspace_id'],
            name=repo['name'],
            provider=repo['provider'],
            repo_url=repo['repo_url'],
            default_branch=repo['default_branch'],
            auth_type=repo['auth_type'],
            credentials_ref=repo.get('credentials_ref'),
            settings=repo.get('settings'),
            created_at=repo['created_at'],
            updated_at=repo['updated_at']
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get repository: {str(e)}")

@router.post("/repos/{repo_id}/analyze")
async def analyze_and_generate_repo(
    repo_id: str,
    request: AnalyzeRepoRequest,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    """
    Manually trigger analyze + generate doc + optionally generate diagram for a repo.
    This chains together:
    1. Analyze repo (create snapshot)
    2. Generate documentation
    3. Save doc to submissions table
    4. Optionally generate and save architecture diagram
    
    Returns the created doc_id.
    """
    try:
        # Get repo config
        workspace_id = user['id']
        try:
            repo_result = supabase.table('workspace_repos').select('*').eq(
                'id', repo_id
            ).eq('workspace_id', workspace_id).single().execute()
        except Exception as e:
            # Table might not exist yet
            if 'relation "workspace_repos" does not exist' in str(e).lower():
                raise HTTPException(
                    status_code=500,
                    detail="workspace_repos table does not exist. Please run the database migration first."
                )
            raise
        
        if not repo_result.data:
            raise HTTPException(status_code=404, detail="Repository not found")
        
        repo = repo_result.data
        repo_url = repo['repo_url']
        branch = repo['default_branch']
        settings = repo.get('settings', {}) or {}
        subdir = settings.get('subdir')
        
        # Step 1: Analyze repository
        analyze_result = await analyze_repository(
            supabase=supabase,
            user_id=user['id'],
            repo_url=repo_url,
            branch=branch,
            subdir=subdir,
            filters=settings.get('filters')
        )
        
        if not analyze_result.get('success'):
            raise HTTPException(status_code=500, detail="Repository analysis failed")
        
        # Track repo scan
        track_repo_scan(supabase, user['id'], repo_id=repo_id, repo_url=repo_url)
        
        # Step 2: Generate documentation
        # Get files from analysis or fetch fresh
        from app.services.github_service import GitHubService
        github_service = GitHubService(supabase, user['id'])
        files = await github_service.fetch_repo_files(repo_url, branch, subdir)
        
        if not files:
            raise HTTPException(status_code=500, detail="No files found in repository")
        
        # Generate doc
        doc_result = await generate_documentation(
            supabase=supabase,
            user_id=user['id'],
            project_name=repo['name'],
            files=files,
            repo_url=repo_url,
            branch=branch,
            subdir=subdir,
            model=None,  # Use default
            prompt_config=settings.get('prompt_config')
        )
        
        markdown = doc_result.get('markdown', '')
        if not markdown:
            raise HTTPException(status_code=500, detail="Documentation generation failed")
        
        # Step 3: Save to submissions table
        source_meta = {
            'repoUrl': repo_url,
            'branch': branch,
            'subdir': subdir,
            'repoId': repo_id,
            'workspaceRepoName': repo['name'],
            'approval_status': 'pending_review',
            'snapshot': analyze_result.get('snapshot')
        }
        
        # Create submission
        submission_result = supabase.table('submissions').insert({
            'created_by': user['id'],
            'title': repo['name'],
            'markdown': markdown,
            'status': 'completed',
            'input_type': 'github_repo',
            'source_meta': source_meta,
            'code_snapshot': analyze_result.get('snapshot'),
            'summary': ' '.join(markdown.split())[:200] if markdown else None,
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }).execute()
        
        if not submission_result.data:
            raise HTTPException(status_code=500, detail="Failed to save document")
        
        doc_id = submission_result.data[0]['id']
        
        # Track doc generation
        track_doc_generated(supabase, user['id'], doc_id=doc_id, repo_id=repo_id)
        
        # Step 4: Optionally generate diagram
        diagram_id = None
        if request.generate_diagram:
            try:
                diagram_result = await generate_architecture_diagram(
                    supabase=supabase,
                    user_id=user['id'],
                    method='github',
                    repo_url=repo_url,
                    branch=branch,
                    subdir=subdir,
                    files=None,  # Will fetch from repo
                    save_diagram=True,
                    title=f"{repo['name']} Architecture"
                )
                # Diagram is saved automatically by generate_architecture_diagram
                # Track diagram generation
                if diagram_result.get('diagram_id'):
                    track_diagram_generated(supabase, user['id'], diagram_id=diagram_result.get('diagram_id'), repo_id=repo_id)
            except Exception as e:
                # Don't fail the whole operation if diagram generation fails
                print(f"Diagram generation failed: {e}")
        
        return {
            'success': True,
            'doc_id': doc_id,
            'diagram_id': diagram_id,
            'message': f"Documentation generated and saved for {repo['name']}"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to analyze and generate: {str(e)}")

