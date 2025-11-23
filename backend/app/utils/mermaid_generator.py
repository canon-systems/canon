"""
Generate Mermaid diagram from detection results
"""
from typing import Dict, Any, List
from datetime import datetime

def generate_mermaid_diagram(detection_result: Dict[str, Any]) -> str:
    """Generate Mermaid diagram syntax"""
    tools = detection_result.get('tools', [])
    connections = detection_result.get('connections', [])
    
    # Separate tools by category
    internal_tools = [t for t in tools if t.get('category') == 'internal']
    external_tools = [t for t in tools if t.get('category') == 'external']
    
    mermaid = '```mermaid\n'
    mermaid += 'graph TB\n'
    mermaid += '    %% Styling - Matches app dark theme\n'
    mermaid += '    classDef internal fill:#1e3a8a,stroke:#3b82f6,stroke-width:2px,color:#fff\n'
    mermaid += '    classDef external fill:#374151,stroke:#6b7280,stroke-width:2px,color:#fff\n'
    mermaid += '    classDef frontend fill:#5b21b6,stroke:#8b5cf6,stroke-width:2px,color:#fff\n'
    mermaid += '    linkStyle default stroke:#ffffff40,stroke-width:2px\n'
    mermaid += '\n'
    
    # Add internal services
    mermaid += '    %% Internal Services\n'
    for tool in internal_tools:
        label = f"{tool.get('icon', '📦')} {tool.get('name', '')}"
        node_id = tool.get('name', '').replace(' ', '_').replace('-', '_')
        # Remove special characters for node ID
        node_id = ''.join(c if c.isalnum() or c == '_' else '_' for c in node_id)
        mermaid += f'    {node_id}["{label}"]\n'
        
        # Special styling for frontend
        if tool.get('name') in ['sveltekit', 'react', 'nextjs']:
            mermaid += f'    class {node_id} frontend\n'
        else:
            mermaid += f'    class {node_id} internal\n'
    
    mermaid += '\n'
    
    # Add external services
    mermaid += '    %% External Services\n'
    for tool in external_tools:
        label = f"{tool.get('icon', '🌐')} {tool.get('name', '')}"
        node_id = tool.get('name', '').replace(' ', '_').replace('-', '_')
        node_id = ''.join(c if c.isalnum() or c == '_' else '_' for c in node_id)
        mermaid += f'    {node_id}["{label}"]\n'
        mermaid += f'    class {node_id} external\n'
    
    mermaid += '\n'
    
    # Add connections
    mermaid += '    %% Connections\n'
    for conn in connections:
        from_id = conn.get('from', '').replace(' ', '_').replace('-', '_')
        from_id = ''.join(c if c.isalnum() or c == '_' else '_' for c in from_id)
        to_id = conn.get('to', '').replace(' ', '_').replace('-', '_')
        to_id = ''.join(c if c.isalnum() or c == '_' else '_' for c in to_id)
        label = conn.get('label', '')
        mermaid += f'    {from_id} -->|"{label}"| {to_id}\n'
    
    mermaid += '```\n'
    
    return mermaid


def generate_markdown_doc(detection_result: Dict[str, Any]) -> str:
    """Generate markdown documentation with diagram"""
    tools = detection_result.get('tools', [])
    connections = detection_result.get('connections', [])
    detected_at = detection_result.get('detectedAt', datetime.utcnow().isoformat())
    
    internal_tools = [t for t in tools if t.get('category') == 'internal']
    external_tools = [t for t in tools if t.get('category') == 'external']
    
    # Format detected_at date
    try:
        dt = datetime.fromisoformat(detected_at.replace('Z', '+00:00'))
        formatted_date = dt.strftime('%B %d, %Y at %I:%M %p')
    except:
        formatted_date = detected_at
    
    markdown = '# Architecture Diagram\n\n'
    markdown += f'*Auto-generated on {formatted_date}*\n\n'
    
    markdown += '## Overview\n\n'
    markdown += 'This diagram shows all tools and services used in this codebase, automatically detected from configuration files and code analysis.\n\n'
    
    markdown += '## Diagram\n\n'
    markdown += generate_mermaid_diagram(detection_result)
    markdown += '\n'
    
    markdown += '## Legend\n\n'
    markdown += '- 🟣 **Frontend** - User-facing application layer\n'
    markdown += '- 🔵 **Internal Services** - Services we control and deploy\n'
    markdown += '- ⚫ **External Services** - Third-party services and APIs\n\n'
    
    markdown += '## Detected Tools\n\n'
    
    if internal_tools:
        markdown += '### Internal Services\n\n'
        for tool in internal_tools:
            icon = tool.get('icon', '📦')
            name = tool.get('name', '')
            description = tool.get('description', 'No description')
            markdown += f'- **{icon} {name}** - {description}\n'
        markdown += '\n'
    
    if external_tools:
        markdown += '### External Services\n\n'
        for tool in external_tools:
            icon = tool.get('icon', '🌐')
            name = tool.get('name', '')
            description = tool.get('description', 'No description')
            markdown += f'- **{icon} {name}** - {description}\n'
        markdown += '\n'
    
    markdown += '## Service Connections\n\n'
    if connections:
        for conn in connections:
            from_tool = conn.get('from', '')
            to_tool = conn.get('to', '')
            label = conn.get('label', '')
            markdown += f'- **{from_tool}** → **{to_tool}**: {label}\n'
    else:
        markdown += 'No explicit connections detected.\n'
    
    markdown += '\n---\n\n'
    markdown += '*This diagram is automatically generated.*\n'
    
    return markdown

