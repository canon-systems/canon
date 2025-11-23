"""
Tool Detection for Architecture Diagrams
"""
from typing import List, Dict, Any, Optional
from datetime import datetime
import json
import re

# Tool detection patterns
TOOL_PATTERNS: Dict[str, Dict[str, Any]] = {
    'supabase': {
        'keywords': ['supabase', '@supabase'],
        'envVars': ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_KEY'],
        'apiPatterns': [re.compile(r'supabase\.co')],
        'category': 'internal',
        'icon': '🗄️',
        'description': 'Database & Authentication'
    },
    'vercel': {
        'keywords': ['vercel', '@vercel'],
        'configFiles': ['vercel.json'],
        'apiPatterns': [re.compile(r'vercel\.ai'), re.compile(r'vercel\.com')],
        'envVars': ['VERCEL_AI_GATEWAY_URL', 'VERCEL_AI_GATEWAY_API_KEY'],
        'category': 'internal',
        'icon': '▲',
        'description': 'Hosting & AI Gateway'
    },
    'github': {
        'keywords': ['github', '@octokit', 'octokit'],
        'apiPatterns': [re.compile(r'github\.com'), re.compile(r'api\.github\.com')],
        'envVars': ['GITHUB_TOKEN'],
        'category': 'external',
        'icon': '🐙',
        'description': 'Version Control & API'
    },
    'sveltekit': {
        'keywords': ['@sveltejs/kit', 'sveltekit', 'svelte-kit'],
        'category': 'internal',
        'icon': '⚡',
        'description': 'Frontend Framework'
    },
    'vite': {
        'keywords': ['vite', '@vitejs'],
        'category': 'internal',
        'icon': '⚡',
        'description': 'Build Tool'
    },
    'tailwindcss': {
        'keywords': ['tailwindcss', '@tailwindcss'],
        'category': 'internal',
        'icon': '🎨',
        'description': 'CSS Framework'
    },
    'tiptap': {
        'keywords': ['@tiptap', 'tiptap'],
        'category': 'internal',
        'icon': '📝',
        'description': 'Rich Text Editor'
    },
    'jszip': {
        'keywords': ['jszip'],
        'category': 'internal',
        'icon': '📦',
        'description': 'File Compression'
    },
    'marked': {
        'keywords': ['marked'],
        'category': 'internal',
        'icon': '📄',
        'description': 'Markdown Parser'
    },
    'turndown': {
        'keywords': ['turndown'],
        'category': 'internal',
        'icon': '📄',
        'description': 'HTML to Markdown'
    },
    'react': {
        'keywords': ['react', '@types/react'],
        'category': 'internal',
        'icon': '⚛️',
        'description': 'UI Framework'
    },
    'nextjs': {
        'keywords': ['next', 'nextjs'],
        'category': 'internal',
        'icon': '▲',
        'description': 'React Framework'
    },
    'express': {
        'keywords': ['express'],
        'category': 'internal',
        'icon': '🚂',
        'description': 'Web Framework'
    },
    'nodejs': {
        'keywords': ['node'],
        'category': 'internal',
        'icon': '🟢',
        'description': 'Runtime'
    },
    'typescript': {
        'keywords': ['typescript', '@types/'],
        'category': 'internal',
        'icon': '🔷',
        'description': 'Programming Language'
    },
    'python': {
        'keywords': ['python', 'django', 'flask', 'fastapi'],
        'category': 'internal',
        'icon': '🐍',
        'description': 'Programming Language'
    },
    'aws': {
        'keywords': ['aws-sdk', '@aws-sdk'],
        'apiPatterns': [re.compile(r'\.amazonaws\.com'), re.compile(r's3\.'), re.compile(r'lambda\.'), re.compile(r'ec2\.')],
        'envVars': ['AWS_ACCESS_KEY', 'AWS_SECRET_KEY', 'AWS_REGION'],
        'category': 'external',
        'icon': '☁️',
        'description': 'Cloud Services'
    },
    'azure': {
        'keywords': ['@azure/'],
        'apiPatterns': [re.compile(r'\.azure\.com'), re.compile(r'\.azurewebsites\.net')],
        'category': 'external',
        'icon': '☁️',
        'description': 'Cloud Services'
    },
    'gcp': {
        'keywords': ['@google-cloud/'],
        'apiPatterns': [re.compile(r'\.googleapis\.com'), re.compile(r'\.gcp\.')],
        'category': 'external',
        'icon': '☁️',
        'description': 'Cloud Services'
    },
    'mongodb': {
        'keywords': ['mongodb', 'mongoose'],
        'apiPatterns': [re.compile(r'mongodb\.net'), re.compile(r'mongodb\.com')],
        'category': 'external',
        'icon': '🍃',
        'description': 'Database'
    },
    'postgresql': {
        'keywords': ['pg', 'postgres', 'postgresql'],
        'category': 'external',
        'icon': '🐘',
        'description': 'Database'
    },
    'mysql': {
        'keywords': ['mysql', 'mysql2'],
        'category': 'external',
        'icon': '🗄️',
        'description': 'Database'
    },
    'redis': {
        'keywords': ['redis', 'ioredis'],
        'category': 'external',
        'icon': '🔴',
        'description': 'Cache & Message Broker'
    },
    'docker': {
        'keywords': ['docker'],
        'configFiles': ['Dockerfile', 'docker-compose.yml'],
        'category': 'internal',
        'icon': '🐳',
        'description': 'Containerization'
    },
    'kubernetes': {
        'keywords': ['kubernetes', 'k8s'],
        'configFiles': ['k8s', 'kubernetes'],
        'category': 'internal',
        'icon': '☸️',
        'description': 'Orchestration'
    }
}

# Service connections
SERVICE_CONNECTIONS = [
    {'from': 'sveltekit', 'to': 'supabase', 'label': 'Database queries'},
    {'from': 'sveltekit', 'to': 'github', 'label': 'API calls'},
    {'from': 'sveltekit', 'to': 'vercel', 'label': 'AI Gateway'},
    {'from': 'vercel', 'to': 'github', 'label': 'Deployments'},
    {'from': 'supabase', 'to': 'github', 'label': 'Webhooks'},
    {'from': 'nextjs', 'to': 'vercel', 'label': 'Deployments'},
    {'from': 'react', 'to': 'nextjs', 'label': 'Framework'},
    {'from': 'express', 'to': 'nodejs', 'label': 'Runtime'}
]


def parse_package_json(content: str) -> Optional[Dict[str, Any]]:
    """Parse package.json content"""
    try:
        return json.loads(content)
    except:
        return None


def search_in_content(content: str, patterns: List[Any]) -> bool:
    """Search for patterns in file content"""
    for pattern in patterns:
        if isinstance(pattern, re.Pattern):
            if pattern.search(content):
                return True
        else:
            if pattern in content:
                return True
    return False


def detect_from_package_json(package_json_content: str, source: str) -> List[Dict[str, Any]]:
    """Detect tools from package.json"""
    pkg = parse_package_json(package_json_content)
    if not pkg:
        return []
    
    detected = []
    all_deps = {
        **(pkg.get('dependencies', {}) or {}),
        **(pkg.get('devDependencies', {}) or {}),
        **(pkg.get('peerDependencies', {}) or {})
    }
    
    for tool_name, pattern in TOOL_PATTERNS.items():
        found = any(
            keyword in dep
            for keyword in pattern.get('keywords', [])
            for dep in all_deps.keys()
        )
        
        if found:
            detected.append({
                'name': tool_name,
                **pattern,
                'source': source
            })
    
    return detected


def detect_from_code_content(content: str, file_name: str) -> List[Dict[str, Any]]:
    """Detect tools from code files"""
    detected = []
    
    for tool_name, pattern in TOOL_PATTERNS.items():
        # Check API patterns
        if pattern.get('apiPatterns') and search_in_content(content, pattern['apiPatterns']):
            detected.append({
                'name': tool_name,
                **pattern,
                'source': 'code analysis',
                'file': file_name
            })
            continue  # Avoid duplicate detection
        
        # Check env vars
        if pattern.get('envVars'):
            env_var_found = any(
                search_in_content(content, [re.compile(env_var, re.IGNORECASE)])
                for env_var in pattern['envVars']
            )
            if env_var_found:
                detected.append({
                    'name': tool_name,
                    **pattern,
                    'source': 'code analysis',
                    'file': file_name
                })
    
    return detected


def detect_from_file_structure(file_name: str) -> List[Dict[str, Any]]:
    """Detect tools from file structure (config files)"""
    detected = []
    file_name_lower = file_name.lower()
    
    for tool_name, pattern in TOOL_PATTERNS.items():
        if pattern.get('configFiles'):
            found = any(
                config_file in file_name_lower
                for config_file in pattern['configFiles']
            )
            if found:
                detected.append({
                    'name': tool_name,
                    **pattern,
                    'source': 'config file',
                    'file': file_name
                })
    
    return detected


def detect_tools(files: List[Dict[str, str]]) -> Dict[str, Any]:
    """
    Main detection function
    """
    detected_tools = {}
    
    # Process each file
    for file in files:
        file_name = file['path'].lower()
        
        # Check package.json files
        if file_name.endswith('package.json'):
            tools = detect_from_package_json(file['content'], 'package.json')
            for tool in tools:
                detected_tools[tool['name']] = tool
        
        # Check config files
        config_tools = detect_from_file_structure(file_name)
        for tool in config_tools:
            detected_tools[tool['name']] = tool
        
        # Check code files
        code_extensions = ['.ts', '.js', '.tsx', '.jsx', '.svelte', '.py', '.java', '.go', '.rs']
        if any(file_name.endswith(ext) for ext in code_extensions):
            code_tools = detect_from_code_content(file['content'], file['path'])
            for tool in code_tools:
                detected_tools[tool['name']] = tool
    
    # Convert to list
    tools = list(detected_tools.values())
    
    # Filter connections to only include detected tools
    tool_names = {t['name'] for t in tools}
    active_connections = [
        conn for conn in SERVICE_CONNECTIONS
        if conn['from'] in tool_names and conn['to'] in tool_names
    ]
    
    return {
        'tools': tools,
        'connections': active_connections,
        'detectedAt': datetime.utcnow().isoformat()
    }

