"""
Change comparison utilities
"""
from typing import Dict, Any, List, Optional
import re

def compare_code_snapshots(
    old_snapshot: Optional[Dict[str, Any]],
    new_snapshot: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    """Compare two code snapshots to detect changes"""
    if not old_snapshot and not new_snapshot:
        return {
            'hasChanges': False,
            'commitChanged': False,
            'filesChanged': [],
            'filesAdded': [],
            'filesRemoved': []
        }
    
    if not old_snapshot:
        # New snapshot, all files are "added"
        new_files = list((new_snapshot or {}).get('fileShas', {}).keys())
        return {
            'hasChanges': True,
            'commitChanged': True,
            'filesChanged': [],
            'filesAdded': new_files,
            'filesRemoved': []
        }
    
    if not new_snapshot:
        # Old snapshot removed, all files are "removed"
        old_files = list(old_snapshot.get('fileShas', {}).keys())
        return {
            'hasChanges': True,
            'commitChanged': True,
            'filesChanged': [],
            'filesAdded': [],
            'filesRemoved': old_files
        }
    
    old_commit_sha = old_snapshot.get('commitSha')
    new_commit_sha = new_snapshot.get('commitSha')
    commit_changed = old_commit_sha != new_commit_sha
    
    old_file_shas = old_snapshot.get('fileShas', {})
    new_file_shas = new_snapshot.get('fileShas', {})
    
    old_paths = set(old_file_shas.keys())
    new_paths = set(new_file_shas.keys())
    
    files_added = list(new_paths - old_paths)
    files_removed = list(old_paths - new_paths)
    
    files_changed = []
    for path in old_paths & new_paths:
        old_hash = old_file_shas.get(path)
        new_hash = new_file_shas.get(path)
        if old_hash != new_hash:
            files_changed.append({
                'path': path,
                'oldHash': old_hash,
                'newHash': new_hash
            })
    
    has_changes = commit_changed or len(files_changed) > 0 or len(files_added) > 0 or len(files_removed) > 0
    
    return {
        'hasChanges': has_changes,
        'commitChanged': commit_changed,
        'filesChanged': files_changed,
        'filesAdded': files_added,
        'filesRemoved': files_removed
    }


def compare_detection_results(
    old_result: Dict[str, Any],
    new_result: Dict[str, Any]
) -> Dict[str, Any]:
    """Compare two DetectionResult objects to identify changes"""
    old_tool_names = {t.get('name') for t in old_result.get('tools', [])}
    new_tool_names = {t.get('name') for t in new_result.get('tools', [])}
    
    tools_added = [
        t.get('name') for t in new_result.get('tools', [])
        if t.get('name') not in old_tool_names
    ]
    tools_removed = [
        t.get('name') for t in old_result.get('tools', [])
        if t.get('name') not in new_tool_names
    ]
    
    # Compare connections
    old_connections = {
        f"{c.get('from')}->{c.get('to')}:{c.get('label')}"
        for c in old_result.get('connections', [])
    }
    new_connections = {
        f"{c.get('from')}->{c.get('to')}:{c.get('label')}"
        for c in new_result.get('connections', [])
    }
    
    connections_added = [
        c for c in new_result.get('connections', [])
        if f"{c.get('from')}->{c.get('to')}:{c.get('label')}" not in old_connections
    ]
    connections_removed = [
        c for c in old_result.get('connections', [])
        if f"{c.get('from')}->{c.get('to')}:{c.get('label')}" not in new_connections
    ]
    
    has_changes = (
        len(tools_added) > 0 or
        len(tools_removed) > 0 or
        len(connections_added) > 0 or
        len(connections_removed) > 0
    )
    
    return {
        'toolsAdded': tools_added,
        'toolsRemoved': tools_removed,
        'connectionsAdded': connections_added,
        'connectionsRemoved': connections_removed,
        'hasChanges': has_changes
    }


def generate_change_summary(comparison: Dict[str, Any]) -> str:
    """Generate human-readable change summary"""
    parts = []
    
    if comparison.get('toolsAdded'):
        parts.append(f"Added {len(comparison['toolsAdded'])} tool(s): {', '.join(comparison['toolsAdded'])}")
    
    if comparison.get('toolsRemoved'):
        parts.append(f"Removed {len(comparison['toolsRemoved'])} tool(s): {', '.join(comparison['toolsRemoved'])}")
    
    if comparison.get('connectionsAdded'):
        conn_strs = [f"{c.get('from')} → {c.get('to')}" for c in comparison['connectionsAdded']]
        parts.append(f"Added {len(comparison['connectionsAdded'])} connection(s): {', '.join(conn_strs)}")
    
    if comparison.get('connectionsRemoved'):
        conn_strs = [f"{c.get('from')} → {c.get('to')}" for c in comparison['connectionsRemoved']]
        parts.append(f"Removed {len(comparison['connectionsRemoved'])} connection(s): {', '.join(conn_strs)}")
    
    if not parts:
        return 'No changes detected'
    
    return '. '.join(parts)


def should_regenerate_diagram(
    code_snapshot_comparison: Dict[str, Any],
    detection_comparison: Dict[str, Any]
) -> bool:
    """Determine if diagram should be regenerated based on changes"""
    # Regenerate if detection result changed
    if detection_comparison.get('hasChanges'):
        return True
    
    # Regenerate if commit changed
    if code_snapshot_comparison.get('commitChanged'):
        return True
    
    # Check if important files changed
    important_patterns = [
        re.compile(r'package\.json$', re.IGNORECASE),
        re.compile(r'package-lock\.json$', re.IGNORECASE),
        re.compile(r'yarn\.lock$', re.IGNORECASE),
        re.compile(r'requirements\.txt$', re.IGNORECASE),
        re.compile(r'Pipfile$', re.IGNORECASE),
        re.compile(r'docker-compose\.yml$', re.IGNORECASE),
        re.compile(r'Dockerfile$', re.IGNORECASE),
        re.compile(r'vercel\.json$', re.IGNORECASE)
    ]
    
    files_changed = code_snapshot_comparison.get('filesChanged', [])
    important_files_changed = any(
        any(pattern.search(file.get('path', '')) for pattern in important_patterns)
        for file in files_changed
    )
    
    return important_files_changed

