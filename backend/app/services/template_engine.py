"""
Template Engine Service - Applies documentation templates
"""
from typing import Dict, Optional, Any
from supabase import Client
import re
from app.utils.markdown_parser import parse_markdown, rebuild_markdown

async def apply_template_to_doc(
    supabase: Client,
    user_id: str,
    doc_id: Optional[str] = None,
    markdown_content: Optional[str] = None,
    template_id: Optional[str] = None,
    template_content: Optional[str] = None
) -> Dict[str, Any]:
    """
    Apply a documentation template to a doc draft.
    """
    # Get markdown content
    if doc_id and not markdown_content:
        try:
            doc = supabase.table('submissions').select('markdown').eq('id', doc_id).single().execute()
            if not doc.data:
                raise ValueError(f"Document {doc_id} not found")
            markdown_content = doc.data.get('markdown', '')
        except Exception as e:
            raise ValueError(f"Error loading document: {e}")
    
    if not markdown_content:
        raise ValueError("markdown_content is required")
    
    # Get template
    if template_id and not template_content:
        # Load template from database (if you have a templates table)
        # For now, we'll use predefined templates
        template_content = get_predefined_template(template_id)
    
    if not template_content:
        # Use default template
        template_content = get_default_template()
    
    # Parse markdown into structured format
    doc_structure = parse_markdown(markdown_content)
    
    # Apply template structure
    transformed = apply_template_structure(doc_structure, template_content)
    
    # Rebuild markdown
    new_markdown = rebuild_markdown(transformed)
    
    # Generate summary of changes
    changes_summary = generate_changes_summary(markdown_content, new_markdown)
    
    return {
        'markdown': new_markdown,
        'template_applied': template_id or 'default',
        'changes_summary': changes_summary
    }


def get_predefined_template(template_id: str) -> Optional[str]:
    """Get predefined template by ID"""
    templates = {
        'minimal': """
# {TITLE}

## Overview
{OVERVIEW}

## Usage
{USAGE}
""",
        'comprehensive': """
# {TITLE}

## Overview
{OVERVIEW}

## Installation
{INSTALLATION}

## Usage
{USAGE}

## API Reference
{API_REFERENCE}

## Examples
{EXAMPLES}

## Contributing
{CONTRIBUTING}
""",
        'api-docs': """
# {TITLE} API Documentation

## Overview
{OVERVIEW}

## Authentication
{AUTHENTICATION}

## Endpoints
{ENDPOINTS}

## Request/Response Examples
{EXAMPLES}

## Error Codes
{ERROR_CODES}
"""
    }
    return templates.get(template_id)


def get_default_template() -> str:
    """Get default template"""
    return """
# {TITLE}

## Overview
{OVERVIEW}

## Key Components
{COMPONENTS}

## Usage
{USAGE}

## API/CLI
{API}

## Setup/Run
{SETUP}

## Limitations
{LIMITATIONS}
"""


def apply_template_structure(doc_structure: Dict[str, Any], template: str) -> Dict[str, Any]:
    """Apply template structure to parsed markdown"""
    # Extract sections from doc_structure
    sections = doc_structure.get('sections', [])
    section_map = {s['title'].lower(): s for s in sections}
    
    # Map sections to template placeholders
    # This is a simplified version - full implementation would be more sophisticated
    transformed_sections = []
    
    # Find placeholders in template
    placeholders = re.findall(r'\{([A-Z_]+)\}', template)
    
    for placeholder in placeholders:
        section_name = placeholder.lower().replace('_', ' ')
        # Try to find matching section
        matching_section = None
        for title, section in section_map.items():
            if section_name in title or title in section_name:
                matching_section = section
                break
        
        if matching_section:
            transformed_sections.append(matching_section)
    
    return {
        'sections': transformed_sections,
        'metadata': doc_structure.get('metadata', {})
    }


def generate_changes_summary(old_markdown: str, new_markdown: str) -> str:
    """Generate summary of changes made by template"""
    old_sections = len(re.findall(r'^#+\s+', old_markdown, re.MULTILINE))
    new_sections = len(re.findall(r'^#+\s+', new_markdown, re.MULTILINE))
    
    if old_sections != new_sections:
        return f"Reorganized from {old_sections} to {new_sections} sections"
    return "Template applied with structure adjustments"

