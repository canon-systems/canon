"""
Repository Analyzer Service
"""
from typing import Dict, List, Optional, Any
from supabase import Client
from app.services.github_service import GitHubService
from app.utils.tool_detection import detect_tools
from datetime import datetime

async def analyze_repository(
    supabase: Client,
    user_id: str,
    repo_url: str,
    branch: str = "main",
    subdir: Optional[str] = None,
    filters: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Analyze a repository and create a snapshot.
    """
    github_service = GitHubService(supabase, user_id)
    
    # Fetch repository files
    files = await github_service.fetch_repo_files(repo_url, branch, subdir)
    
    if not files:
        raise ValueError(f"No files found in repository {repo_url}")
    
    # Detect programming languages
    languages = detect_languages(files)
    
    # Run tool detection
    detection_result = detect_tools(files)
    
    # Create code snapshot
    commit_sha = await github_service.get_commit_sha(repo_url, branch)
    file_paths = [f["path"] for f in files]
    file_shas = await github_service.get_file_shas(repo_url, branch, file_paths)
    
    snapshot = {
        "commitSha": commit_sha,
        "fileShas": file_shas,
        "createdAt": datetime.utcnow().isoformat()
    }
    
    # Build file info
    file_info = [
        {
            "path": f["path"],
            "size": len(f.get("content", "")),
            "hash": file_shas.get(f["path"]),
            "language": detect_language_from_path(f["path"])
        }
        for f in files
    ]
    
    return {
        "success": True,
        "message": f"Repo analyzed: {len(files)} files, {len(detection_result['tools'])} tools detected",
        "files": file_info,
        "languages": languages,
        "detection_result": detection_result,
        "snapshot": snapshot
    }


def detect_languages(files: List[Dict[str, str]]) -> List[str]:
    """Detect programming languages from file extensions"""
    extensions = set()
    for file in files:
        path = file["path"]
        lang = detect_language_from_path(path)
        if lang:
            extensions.add(lang)
    return sorted(list(extensions))


def detect_language_from_path(path: str) -> Optional[str]:
    """Detect language from file path"""
    if not path or '.' not in path:
        return None
    
    ext = path.split('.')[-1].lower()
    lang_map = {
        'py': 'Python',
        'js': 'JavaScript',
        'ts': 'TypeScript',
        'tsx': 'TypeScript',
        'jsx': 'JavaScript',
        'java': 'Java',
        'go': 'Go',
        'rs': 'Rust',
        'rb': 'Ruby',
        'php': 'PHP',
        'cpp': 'C++',
        'c': 'C',
        'cs': 'C#',
        'swift': 'Swift',
        'kt': 'Kotlin',
        'scala': 'Scala',
        'clj': 'Clojure',
        'sh': 'Shell',
        'bash': 'Bash',
        'zsh': 'Zsh',
        'fish': 'Fish',
        'html': 'HTML',
        'css': 'CSS',
        'scss': 'SCSS',
        'sass': 'SASS',
        'less': 'Less',
        'md': 'Markdown',
        'json': 'JSON',
        'yaml': 'YAML',
        'yml': 'YAML',
        'toml': 'TOML',
        'xml': 'XML',
        'sql': 'SQL',
        'r': 'R',
        'm': 'MATLAB',
        'dart': 'Dart',
        'lua': 'Lua',
        'pl': 'Perl',
        'pm': 'Perl',
        'ps1': 'PowerShell',
        'psm1': 'PowerShell',
        'psd1': 'PowerShell'
    }
    return lang_map.get(ext)

