"""
Architecture Diagram Generator Service
"""
from typing import Dict, List, Optional, Any
from supabase import Client
from app.services.github_service import GitHubService
from app.utils.tool_detection import detect_tools
from app.utils.mermaid_generator import generate_markdown_doc
from datetime import datetime
import zipfile
import io

async def generate_architecture_diagram(
    supabase: Client,
    user_id: Optional[str],
    method: str,
    repo_url: Optional[str] = None,
    branch: Optional[str] = None,
    subdir: Optional[str] = None,
    files: Optional[List[Dict[str, str]]] = None,
    zip_content: Optional[bytes] = None,
    save_diagram: bool = False,
    title: str = "Untitled Diagram",
    description: Optional[str] = None
) -> Dict[str, Any]:
    """
    Generate architecture diagram from repository or files.
    """
    # Get files based on method
    if method == 'github':
        if not repo_url:
            raise ValueError("repo_url required for github method")
        if not user_id:
            raise ValueError("user_id required for github method")
        
        github_service = GitHubService(supabase, user_id)
        branch = branch or 'main'
        files = await github_service.fetch_repo_files(repo_url, branch, subdir)
        
        if not files:
            raise ValueError("No files found in repository")
    elif method == 'zip':
        if not zip_content:
            raise ValueError("zip_content required for zip method")
        
        files = extract_files_from_zip(zip_content)
        
        if not files:
            raise ValueError("No files found in ZIP")
    elif method == 'files':
        if not files:
            raise ValueError("files required for files method")
    else:
        raise ValueError(f"Unknown method: {method}")
    
    # Run tool detection
    detection_result = detect_tools(files)
    
    # Generate diagram markdown
    diagram_markdown = generate_markdown_doc(detection_result)
    
    # Get code snapshot if saving and repo_url provided
    code_snapshot = None
    last_commit_sha = None
    
    if save_diagram and repo_url and user_id:
        github_service = GitHubService(supabase, user_id)
        branch = branch or 'main'
        
        last_commit_sha = await github_service.get_commit_sha(repo_url, branch)
        file_paths = [f['path'] for f in files]
        file_shas = await github_service.get_file_shas(repo_url, branch, file_paths)
        
        code_snapshot = {
            'commitSha': last_commit_sha,
            'fileShas': file_shas,
            'createdAt': datetime.utcnow().isoformat()
        }
    
    # Save to database if requested
    diagram_id = None
    is_new_diagram = False
    
    if save_diagram and user_id:
        if repo_url:
            # Check if diagram already exists
            try:
                existing = supabase.table('architecture_diagrams').select('*').eq(
                    'user_id', user_id
                ).eq('repo_url', repo_url).eq('branch', branch or 'main').execute()
                
                if existing.data and len(existing.data) > 0:
                    # Update existing
                    diagram_id = existing.data[0]['id']
                    supabase.table('architecture_diagrams').update({
                        'detection_result': detection_result,
                        'diagram_markdown': diagram_markdown,
                        'code_snapshot': code_snapshot,
                        'last_commit_sha': last_commit_sha,
                        'title': title,
                        'description': description,
                        'last_updated_at': datetime.utcnow().isoformat()
                    }).eq('id', diagram_id).execute()
                else:
                    # Create new
                    repo_provider = 'github' if 'github.com' in repo_url else 'unknown'
                    result = supabase.table('architecture_diagrams').insert({
                        'user_id': user_id,
                        'repo_provider': repo_provider,
                        'repo_url': repo_url,
                        'branch': branch or 'main',
                        'subdir': subdir,
                        'detection_result': detection_result,
                        'diagram_markdown': diagram_markdown,
                        'code_snapshot': code_snapshot,
                        'last_commit_sha': last_commit_sha,
                        'title': title,
                        'description': description
                    }).execute()
                    
                    if result.data:
                        diagram_id = result.data[0]['id']
                        is_new_diagram = True
            except Exception as e:
                print(f"Error saving diagram: {e}")
    
    return {
        'diagram': diagram_markdown,
        'tools': detection_result,
        'file_count': len(files),
        'saved': save_diagram and diagram_id is not None,
        'diagram_id': diagram_id,
        'is_new_diagram': is_new_diagram
    }


def extract_files_from_zip(zip_content: bytes) -> List[Dict[str, str]]:
    """Extract relevant files from ZIP archive"""
    files = []
    
    with zipfile.ZipFile(io.BytesIO(zip_content), 'r') as zip_file:
        relevant_extensions = {
            '.py', '.js', '.ts', '.tsx', '.jsx', '.java', '.go', '.rs',
            '.json', '.yaml', '.yml', '.toml', '.xml', '.html', '.css',
            '.md', '.txt', 'package.json', 'requirements.txt', 'Pipfile',
            'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'composer.json'
        }
        
        for name in zip_file.namelist():
            # Skip directories and hidden files
            if name.endswith('/') or name.startswith('.'):
                continue
            
            # Check if file is relevant
            is_relevant = any(
                name.lower().endswith(ext) or name.lower() == ext
                for ext in relevant_extensions
            )
            
            if is_relevant:
                try:
                    content = zip_file.read(name).decode('utf-8')
                    files.append({'path': name, 'content': content})
                except:
                    # Skip binary files
                    pass
    
    return files

