"""
GitHub Service - Handles all GitHub API operations
"""
from typing import List, Dict, Optional, Tuple
from supabase import Client
from app.core.nango import get_github_token
import httpx
import base64
import re

class GitHubService:
    def __init__(self, supabase: Client, user_id: Optional[str] = None):
        self.supabase = supabase
        self.user_id = user_id
        self._octokit = None
    
    async def _get_octokit(self):
        """Get authenticated Octokit instance"""
        if self._octokit:
            return self._octokit
        
        token = None
        if self.user_id:
            # Get user's GitHub connection
            try:
                connection = self.supabase.table('oauth_connections').select('connection_id').eq(
                    'user_id', self.user_id
                ).eq('provider', 'github').eq('status', 'active').single().execute()
                
                if connection.data:
                    token = await get_github_token(connection.data['connection_id'])
            except:
                pass
        
        # Create Octokit-like client (using httpx for async)
        self._octokit = GitHubClient(token)
        return self._octokit
    
    def parse_repo_url(self, repo_url: str) -> Optional[Dict[str, str]]:
        """Parse GitHub repository URL into owner/repo"""
        try:
            match = re.match(r'.*github\.com/([^/]+)/([^/]+)', repo_url)
            if match:
                return {'owner': match.group(1), 'repo': match.group(2).replace('.git', '')}
        except:
            pass
        return None
    
    async def get_commit_sha(self, repo_url: str, branch: str) -> Optional[str]:
        """Get the latest commit SHA for a branch"""
        repo_info = self.parse_repo_url(repo_url)
        if not repo_info:
            return None
        
        octokit = await self._get_octokit()
        return await octokit.get_branch_commit(repo_info['owner'], repo_info['repo'], branch)
    
    async def get_file_shas(
        self,
        repo_url: str,
        branch: str,
        file_paths: List[str]
    ) -> Dict[str, Optional[str]]:
        """Get file SHAs for multiple files (batch operation)"""
        repo_info = self.parse_repo_url(repo_url)
        if not repo_info:
            return {path: None for path in file_paths}
        
        octokit = await self._get_octokit()
        commit_sha = await self.get_commit_sha(repo_url, branch)
        if not commit_sha:
            return {path: None for path in file_paths}
        
        # Use tree API for batch fetching
        return await octokit.get_file_shas_batch(
            repo_info['owner'],
            repo_info['repo'],
            commit_sha,
            file_paths
        )
    
    async def fetch_repo_files(
        self,
        repo_url: str,
        branch: str,
        subdir: Optional[str] = None
    ) -> List[Dict[str, str]]:
        """Fetch all relevant files from a repository"""
        repo_info = self.parse_repo_url(repo_url)
        if not repo_info:
            return []
        
        octokit = await self._get_octokit()
        return await octokit.fetch_files(
            repo_info['owner'],
            repo_info['repo'],
            branch,
            subdir
        )


class GitHubClient:
    """Async GitHub API client using httpx"""
    
    def __init__(self, token: Optional[str] = None):
        self.token = token
        self.base_url = "https://api.github.com"
        self.headers = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Sync-API'
        }
        if token:
            self.headers['Authorization'] = f'token {token}'
    
    async def get_branch_commit(self, owner: str, repo: str, branch: str) -> Optional[str]:
        """Get commit SHA for a branch"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/repos/{owner}/{repo}/branches/{branch}",
                headers=self.headers
            )
            if response.is_success:
                data = response.json()
                return data.get('commit', {}).get('sha')
        return None
    
    async def get_file_shas_batch(
        self,
        owner: str,
        repo: str,
        commit_sha: str,
        file_paths: List[str]
    ) -> Dict[str, Optional[str]]:
        """Get file SHAs using tree API (efficient batch operation)"""
        result = {}
        
        try:
            # Get recursive tree
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/repos/{owner}/{repo}/git/trees/{commit_sha}?recursive=1",
                    headers=self.headers
                )
                
                if response.is_success:
                    tree_data = response.json()
                    tree_map = {
                        item['path']: item['sha']
                        for item in tree_data.get('tree', [])
                        if item.get('type') == 'blob' and item.get('path') and item.get('sha')
                    }
                    
                    for path in file_paths:
                        result[path] = tree_map.get(path)
                else:
                    # Fallback to individual calls
                    for path in file_paths:
                        result[path] = await self._get_file_sha_individual(owner, repo, commit_sha, path)
        except:
            # Fallback to individual calls
            for path in file_paths:
                result[path] = await self._get_file_sha_individual(owner, repo, commit_sha, path)
        
        return result
    
    async def _get_file_sha_individual(
        self,
        owner: str,
        repo: str,
        ref: str,
        path: str
    ) -> Optional[str]:
        """Get file SHA individually (fallback)"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/repos/{owner}/{repo}/contents/{path}",
                headers=self.headers,
                params={'ref': ref}
            )
            if response.is_success:
                data = response.json()
                return data.get('sha')
        return None
    
    async def fetch_files(
        self,
        owner: str,
        repo: str,
        branch: str,
        subdir: Optional[str] = None
    ) -> List[Dict[str, str]]:
        """Fetch files from repository (filtering by subdir if provided)"""
        files = []
        
        # Get commit SHA first
        commit_sha = await self.get_branch_commit(owner, repo, branch)
        if not commit_sha:
            return files
        
        # Get recursive tree
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/repos/{owner}/{repo}/git/trees/{commit_sha}?recursive=1",
                headers=self.headers
            )
            
            if response.is_success:
                tree_data = response.json()
                tree_items = [
                    item for item in tree_data.get('tree', [])
                    if item.get('type') == 'blob'
                ]
                
                # Filter by subdir if provided
                if subdir:
                    subdir_prefix = subdir.rstrip('/') + '/'
                    tree_items = [
                        item for item in tree_items
                        if item.get('path', '').startswith(subdir_prefix)
                    ]
                
                # Filter out binary/large files
                relevant_extensions = {
                    '.py', '.js', '.ts', '.tsx', '.jsx', '.java', '.go', '.rs',
                    '.rb', '.php', '.cpp', '.c', '.h', '.hpp', '.cs', '.swift',
                    '.kt', '.scala', '.clj', '.sh', '.bash', '.zsh', '.fish',
                    '.json', '.yaml', '.yml', '.toml', '.ini', '.xml', '.html',
                    '.css', '.scss', '.sass', '.less', '.md', '.txt', '.rst',
                    '.dockerfile', '.makefile', '.cmake', '.gradle', '.maven',
                    'package.json', 'requirements.txt', 'Pipfile', 'Cargo.toml',
                    'go.mod', 'pom.xml', 'build.gradle', 'composer.json'
                }
                
                tree_items = [
                    item for item in tree_items
                    if any(item.get('path', '').lower().endswith(ext) for ext in relevant_extensions)
                    or any(item.get('path', '').lower() == ext for ext in relevant_extensions)
                ]
                
                # Fetch content for each file
                for item in tree_items[:500]:  # Limit to 500 files
                    path = item.get('path')
                    if not path:
                        continue
                    
                    content = await self._fetch_file_content(owner, repo, branch, path)
                    if content:
                        files.append({'path': path, 'content': content})
        
        return files
    
    async def _fetch_file_content(
        self,
        owner: str,
        repo: str,
        ref: str,
        path: str
    ) -> Optional[str]:
        """Fetch file content from GitHub"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/repos/{owner}/{repo}/contents/{path}",
                headers=self.headers,
                params={'ref': ref}
            )
            
            if response.is_success:
                data = response.json()
                if data.get('encoding') == 'base64' and data.get('content'):
                    try:
                        return base64.b64decode(data['content']).decode('utf-8')
                    except:
                        return None
        return None

