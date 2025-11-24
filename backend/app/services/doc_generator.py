"""
Documentation Generator Service
"""
from typing import Dict, List, Optional, Any
from supabase import Client
from app.services.github_service import GitHubService
from app.services.llm_gateway import LLMGateway
from app.utils.prompt_builder import build_system_prompt

MAX_PER_FILE = 200_000  # Safety cap for file content

async def generate_documentation(
    supabase: Client,
    user_id: Optional[str],
    project_name: str,
    model: str,
    files: Optional[List[Dict[str, str]]] = None,
    repo_url: Optional[str] = None,
    branch: Optional[str] = None,
    subdir: Optional[str] = None,
    prompt_config: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Generate documentation from files or repository.
    """
    if not model:
        raise ValueError("Model is required")
    
    # Get files if repo_url provided
    if repo_url and not files:
        if not user_id:
            raise ValueError("user_id required for repository access")
        
        github_service = GitHubService(supabase, user_id)
        branch = branch or 'main'
        files = await github_service.fetch_repo_files(repo_url, branch, subdir)
    
    if not files or len(files) == 0:
        raise ValueError("No files provided")
    
    # Clip files to max size
    clipped = []
    for f in files:
        path = str(f.get('path', 'unknown'))
        raw_content = str(f.get('content', ''))
        content = raw_content[:MAX_PER_FILE] if len(raw_content) > MAX_PER_FILE else raw_content
        clipped.append({'path': path, 'content': content})
    
    # Build system prompt
    system = build_system_prompt(prompt_config, is_update=False)
    
    # Build user prompt
    user = f"Project: {project_name}\n\n"
    user += f"Files ({len(clipped)}):\n"
    user += '\n\n'.join([
        f"--- FILE: {f['path']} ---\n{f['content']}"
        for f in clipped
    ])
    
    # Call LLM
    gateway = LLMGateway()
    temperature = prompt_config.get('temperature') if prompt_config else None
    markdown = (await gateway.call(
        [
            {'role': 'system', 'content': system},
            {'role': 'user', 'content': user}
        ],
        model=model,
        temperature=temperature
    )).strip()
    
    return {
        'markdown': markdown,
        'model': model,
        'prompt_config': prompt_config
    }

