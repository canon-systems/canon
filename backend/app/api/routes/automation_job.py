"""
Automation Job Endpoint
Scheduled job that runs automation rules for repositories.
"""
from fastapi import APIRouter, Depends, HTTPException, Header
from app.core.database import get_supabase
from supabase import Client
from typing import Dict, Any, Optional
from app.utils.automation_rules import get_due_rules, update_rule_last_run
from app.services.repo_analyzer import analyze_repository
from app.services.doc_generator import generate_documentation
from app.services.diagram_generator import generate_architecture_diagram
from app.utils.auto_approval import should_auto_approve
from app.utils.usage_tracking import (
    track_repo_scan,
    track_doc_generated,
    track_diagram_generated,
    track_auto_publish,
    track_push_to_kb
)
# Import approval logic directly (we'll inline it since approve_doc uses Depends)
# from app.api.routes.push.notion import push_to_notion
# from app.api.routes.push.confluence import push_to_confluence
# from app.api.routes.push.coda import push_to_coda
from app.api.schemas.push import PushRequest, WorkspaceInfo
from datetime import datetime
import os

router = APIRouter()


async def execute_rule(
    supabase: Client,
    repo: Dict[str, Any],
    rule: Dict[str, Any],
    workspace_id: str
) -> Dict[str, Any]:
    """
    Execute an automation rule for a repository.
    
    Returns:
        Dict with execution results
    """
    repo_id = repo['id']
    repo_url = repo['repo_url']
    branch = repo.get('default_branch', 'main')
    settings = repo.get('settings', {}) or {}
    subdir = settings.get('subdir')
    
    result = {
        'repo_id': repo_id,
        'rule_id': rule.get('id') or rule.get('name', 'default'),
        'success': False,
        'actions': [],
        'errors': []
    }
    
    try:
        # Step 1: Detect changes (if rule requires it)
        if rule.get('detect_changes', True):
            try:
                analyze_result = await analyze_repository(
                    supabase=supabase,
                    user_id=workspace_id,
                    repo_url=repo_url,
                    branch=branch,
                    subdir=subdir,
                    filters=settings.get('filters')
                )
                
                if analyze_result.get('success'):
                    track_repo_scan(supabase, workspace_id, repo_id=repo_id, repo_url=repo_url)
                    result['actions'].append('detect_changes')
                else:
                    result['errors'].append('Failed to detect changes')
                    return result
            except Exception as e:
                result['errors'].append(f"Change detection failed: {str(e)}")
                return result
        
        # Step 2: Generate documentation (if rule requires it)
        doc_id = None
        if rule.get('generate_doc', True):
            try:
                from app.services.github_service import GitHubService
                github_service = GitHubService(supabase, workspace_id)
                files = await github_service.fetch_repo_files(repo_url, branch, subdir)
                
                if not files:
                    result['errors'].append('No files found in repository')
                    return result
                
                # Get model from repo settings or use default
                model = settings.get('model') or 'gpt-4o'
                
                doc_result = await generate_documentation(
                    supabase=supabase,
                    user_id=workspace_id,
                    project_name=repo['name'],
                    model=model,
                    files=files,
                    repo_url=repo_url,
                    branch=branch,
                    subdir=subdir,
                    prompt_config=settings.get('prompt_config')
                )
                
                markdown = doc_result.get('markdown', '')
                if not markdown:
                    result['errors'].append('Documentation generation failed')
                    return result
                
                # Find previous doc for this repo
                previous_doc = None
                try:
                    prev_result = supabase.table('submissions').select('id').eq(
                        'created_by', workspace_id
                    ).eq('input_type', 'github_repo').order('created_at', desc=True).limit(1).execute()
                    
                    if prev_result.data and len(prev_result.data) > 0:
                        # Check if it's for the same repo
                        prev_doc_full = supabase.table('submissions').select('*').eq(
                            'id', prev_result.data[0]['id']
                        ).single().execute()
                        if prev_doc_full.data:
                            prev_meta = prev_doc_full.data.get('source_meta', {}) or {}
                            if prev_meta.get('repoId') == repo_id:
                                previous_doc = prev_result.data[0]['id']
                except:
                    pass
                
                # Save to submissions table
                source_meta = {
                    'repoUrl': repo_url,
                    'branch': branch,
                    'subdir': subdir,
                    'repoId': repo_id,
                    'workspaceRepoName': repo['name'],
                    'approval_status': 'pending_review',
                    'snapshot': analyze_result.get('snapshot') if 'analyze_result' in locals() else None,
                    'automation_rule_id': rule.get('id') or rule.get('name', 'default')
                }
                
                submission_result = supabase.table('submissions').insert({
                    'created_by': workspace_id,
                    'title': repo['name'],
                    'markdown': markdown,
                    'status': 'completed',
                    'input_type': 'github_repo',
                    'source_meta': source_meta,
                    'code_snapshot': analyze_result.get('snapshot') if 'analyze_result' in locals() else None,
                    'summary': ' '.join(markdown.split())[:200] if markdown else None,
                    'created_at': datetime.utcnow().isoformat(),
                    'updated_at': datetime.utcnow().isoformat()
                }).execute()
                
                if not submission_result.data:
                    result['errors'].append('Failed to save document')
                    return result
                
                doc_id = submission_result.data[0]['id']
                track_doc_generated(supabase, workspace_id, doc_id=doc_id, repo_id=repo_id)
                result['actions'].append('generate_doc')
                result['doc_id'] = doc_id
                
            except Exception as e:
                result['errors'].append(f"Documentation generation failed: {str(e)}")
                return result
        
        # Step 3: Generate diagram (if rule requires it)
        if rule.get('generate_diagram', False) and doc_id:
            try:
                await generate_architecture_diagram(
                    supabase=supabase,
                    user_id=workspace_id,
                    method='github',
                    repo_url=repo_url,
                    branch=branch,
                    subdir=subdir,
                    files=None,
                    save_diagram=True,
                    title=f"{repo['name']} Architecture"
                )
                track_diagram_generated(supabase, workspace_id, repo_id=repo_id)
                result['actions'].append('generate_diagram')
            except Exception as e:
                result['errors'].append(f"Diagram generation failed: {str(e)}")
                # Don't fail the whole operation
        
        # Step 4: Auto-approval and publish (if rule allows)
        if doc_id and rule.get('auto_publish', False):
            try:
                # Check if should auto-approve
                approval_result = should_auto_approve(
                    supabase=supabase,
                    doc_id=doc_id,
                    user_id=workspace_id,
                    rule_config=rule,
                    previous_doc_id=previous_doc if 'previous_doc' in locals() else None
                )
                
                if approval_result.get('should_approve'):
                    # Auto-approve - inline the approval logic
                    try:
                        # Fetch document
                        doc_result = supabase.table('submissions').select('*').eq('id', doc_id).single().execute()
                        
                        if doc_result.data:
                            doc = doc_result.data
                            
                            # Update document with approval status
                            source_meta = doc.get('source_meta', {}) or {}
                            source_meta['approval_status'] = 'approved'
                            source_meta['approved_at'] = datetime.utcnow().isoformat()
                            source_meta['approved_by'] = workspace_id
                            source_meta['auto_approved'] = True
                            
                            update_data = {
                                'source_meta': source_meta
                            }
                            
                            supabase.table('submissions').update(update_data).eq('id', doc_id).execute()
                            result['actions'].append('auto_approve')
                    except Exception as e:
                        result['errors'].append(f"Auto-approval update failed: {str(e)}")
                    
                    # Auto-publish if rule specifies target
                    publish_target = rule.get('auto_publish_target')
                    if publish_target:
                        try:
                            # Get connection for the provider
                            provider = publish_target.get('provider', 'notion')
                            connection = supabase.table('oauth_connections').select('connection_id').eq(
                                'user_id', workspace_id
                            ).eq('provider', provider).eq('status', 'active').single().execute()
                            
                            if connection.data:
                                # Push to KB using workspace provider directly
                                from app.services.workspace import get_workspace_provider
                                from app.services.workspace.base import WorkspaceInfo, WorkspaceContent
                                
                                workspace_provider = get_workspace_provider(provider, supabase)
                                if workspace_provider:
                                    ws_info = WorkspaceInfo(
                                        provider=provider,
                                        resource_id=publish_target.get('resource_id'),
                                        metadata=publish_target.get('metadata')
                                    )
                                    
                                    content = WorkspaceContent(
                                        title=repo['name'],
                                        markdown=markdown
                                    )
                                    
                                    push_result_obj = await workspace_provider.push_content(
                                        workspace_info=ws_info,
                                        content=content,
                                        connection_id=connection.data['connection_id'],
                                        create_new=True
                                    )
                                    
                                    push_result = {
                                        'success': push_result_obj is not None,
                                        'resource_id': push_result_obj.resource_id if push_result_obj else None
                                    }
                                else:
                                    push_result = None
                                
                                if push_result and push_result.get('success'):
                                    track_push_to_kb(
                                        supabase,
                                        workspace_id,
                                        provider=provider,
                                        doc_id=doc_id
                                    )
                                    track_auto_publish(
                                        supabase,
                                        workspace_id,
                                        doc_id=doc_id,
                                        reason=approval_result.get('reason', 'auto_approved'),
                                        diff_size=approval_result.get('diff_size', {}).get('total_changes') if approval_result.get('diff_size') else None
                                    )
                                    result['actions'].append('auto_publish')
                        except Exception as e:
                            result['errors'].append(f"Auto-publish failed: {str(e)}")
                else:
                    result['actions'].append(f"skipped_auto_approve: {approval_result.get('reason')}")
            
            except Exception as e:
                result['errors'].append(f"Auto-approval failed: {str(e)}")
        
        result['success'] = len(result['errors']) == 0
        return result
    
    except Exception as e:
        result['errors'].append(f"Rule execution failed: {str(e)}")
        return result


@router.post("/automation/run")
async def run_automation_job(
    supabase: Client = Depends(get_supabase),
    authorization: Optional[str] = Header(None)
) -> Dict[str, Any]:
    """
    Run automation job - finds all due rules and executes them.
    This endpoint should be called by a cron job.
    
    Requires CRON_SECRET in Authorization header if configured.
    """
    # Verify cron secret (if configured)
    cron_secret = os.getenv('CRON_SECRET')
    if cron_secret:
        if not authorization or authorization != f"Bearer {cron_secret}":
            raise HTTPException(status_code=401, detail="Unauthorized")
    
    try:
        # Get all due rules
        due_rules = get_due_rules(supabase)
        
        if not due_rules:
            return {
                'success': True,
                'rules_checked': 0,
                'rules_executed': 0,
                'results': []
            }
        
        results = []
        for rule_info in due_rules:
            repo = rule_info['repo']
            rule = rule_info['rule']
            repo_id = repo['id']
            rule_id = rule_info['rule_id']
            workspace_id = repo['workspace_id']
            
            # Execute rule
            execution_result = await execute_rule(
                supabase=supabase,
                repo=repo,
                rule=rule,
                workspace_id=workspace_id
            )
            
            results.append(execution_result)
            
            # Update last run time if successful
            if execution_result.get('success'):
                update_rule_last_run(supabase, repo_id, rule_id, workspace_id)
        
        successful = len([r for r in results if r.get('success')])
        
        return {
            'success': True,
            'rules_checked': len(due_rules),
            'rules_executed': len(results),
            'rules_successful': successful,
            'results': results
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Automation job failed: {str(e)}")

