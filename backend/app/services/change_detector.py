"""
Change Detection Service
"""
from typing import Dict, List, Optional, Any
from supabase import Client
from app.services.github_service import GitHubService
from app.utils.change_comparison import (
    compare_code_snapshots,
    compare_detection_results,
    should_regenerate_diagram
)
from app.utils.tool_detection import detect_tools
from datetime import datetime

async def detect_repository_changes(
    supabase: Client,
    user_id: str,
    repo_url: Optional[str] = None,
    branch: Optional[str] = None,
    commit_range: Optional[str] = None,
    submission_id: Optional[str] = None,
    diagram_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Detect changes in a repository since last analysis.
    """
    github_service = GitHubService(supabase, user_id)
    
    # Get old snapshot from database
    old_snapshot = None
    old_detection_result = None
    
    if submission_id:
        # Load submission
        try:
            submission = supabase.table('submissions').select('*').eq('id', submission_id).single().execute()
            if submission.data:
                old_snapshot = submission.data.get('code_snapshot')
                repo_url = submission.data.get('source_meta', {}).get('repoUrl') or repo_url
                branch = submission.data.get('source_meta', {}).get('branch') or branch or 'main'
        except:
            pass
    elif diagram_id:
        # Load diagram
        try:
            diagram = supabase.table('architecture_diagrams').select('*').eq('id', diagram_id).single().execute()
            if diagram.data:
                old_snapshot = diagram.data.get('code_snapshot')
                old_detection_result = diagram.data.get('detection_result')
                repo_url = diagram.data.get('repo_url') or repo_url
                branch = diagram.data.get('branch') or branch or 'main'
        except:
            pass
    
    if not repo_url:
        raise ValueError("repo_url is required")
    
    branch = branch or 'main'
    
    # Get current state
    commit_sha = await github_service.get_commit_sha(repo_url, branch)
    if not commit_sha:
        raise ValueError(f"Could not get commit SHA for {repo_url}/{branch}")
    
    # Get current file SHAs
    if old_snapshot and old_snapshot.get('fileShas'):
        file_paths = list(old_snapshot['fileShas'].keys())
    else:
        # Fetch all files to get current state
        files = await github_service.fetch_repo_files(repo_url, branch)
        file_paths = [f['path'] for f in files]
    
    current_file_shas = await github_service.get_file_shas(repo_url, branch, file_paths)
    
    new_snapshot = {
        'commitSha': commit_sha,
        'fileShas': current_file_shas,
        'createdAt': datetime.utcnow().isoformat()
    }
    
    # Compare snapshots
    code_comparison = compare_code_snapshots(old_snapshot, new_snapshot)
    
    # Compare detection results if applicable
    detection_comparison = {'hasChanges': False}
    architecture_changes = None
    
    if diagram_id and old_detection_result:
        # Re-run detection on changed files
        changed_files = []
        for file_change in code_comparison['filesChanged']:
            # Fetch changed file content
            files = await github_service.fetch_repo_files(repo_url, branch)
            changed_file = next((f for f in files if f['path'] == file_change['path']), None)
            if changed_file:
                changed_files.append(changed_file)
        
        if changed_files or code_comparison['filesAdded']:
            new_detection_result = detect_tools(changed_files)
            detection_comparison = compare_detection_results(old_detection_result, new_detection_result)
            
            architecture_changes = {
                'tools_added': detection_comparison['toolsAdded'],
                'tools_removed': detection_comparison['toolsRemoved'],
                'connections_added': detection_comparison['connectionsAdded'],
                'connections_removed': detection_comparison['connectionsRemoved']
            }
    
    # Build summary
    summary_parts = []
    if code_comparison['commitChanged']:
        summary_parts.append("Commit changed")
    if code_comparison['filesChanged']:
        summary_parts.append(f"{len(code_comparison['filesChanged'])} file(s) modified")
    if code_comparison['filesAdded']:
        summary_parts.append(f"{len(code_comparison['filesAdded'])} file(s) added")
    if code_comparison['filesRemoved']:
        summary_parts.append(f"{len(code_comparison['filesRemoved'])} file(s) removed")
    
    summary = '. '.join(summary_parts) if summary_parts else 'No changes detected'
    
    # Update database
    if submission_id:
        try:
            supabase.table('submissions').update({
                'is_outdated': code_comparison['hasChanges'],
                'last_checked_at': datetime.utcnow().isoformat()
            }).eq('id', submission_id).execute()
        except:
            pass
    elif diagram_id:
        try:
            supabase.table('architecture_diagrams').update({
                'last_checked_at': datetime.utcnow().isoformat()
            }).eq('id', diagram_id).execute()
        except:
            pass
    
    return {
        'has_changes': code_comparison['hasChanges'],
        'commit_changed': code_comparison['commitChanged'],
        'files_changed': [
            {
                'path': fc['path'],
                'old_hash': fc['oldHash'],
                'new_hash': fc['newHash'],
                'status': 'modified'
            }
            for fc in code_comparison['filesChanged']
        ],
        'files_added': code_comparison['filesAdded'],
        'files_removed': code_comparison['filesRemoved'],
        'architecture_changes': architecture_changes,
        'summary': summary,
        'current_commit_sha': commit_sha,
        'old_commit_sha': old_snapshot.get('commitSha') if old_snapshot else None
    }

