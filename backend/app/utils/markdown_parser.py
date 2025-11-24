"""
Markdown parsing utilities
"""
from typing import Dict, Any, List, Optional
import re

def parse_markdown(markdown: str) -> Dict[str, Any]:
    """Parse markdown into structured format"""
    sections = []
    lines = markdown.split('\n')
    current_section = None
    current_content = []
    current_level = 1
    
    for line in lines:
        # Check for heading
        heading_match = re.match(r'^(#{1,6})\s+(.+)$', line)
        if heading_match:
            # Save previous section
            if current_section:
                sections.append({
                    'title': current_section,
                    'content': '\n'.join(current_content).strip(),
                    'level': current_level
                })
            
            # Start new section
            current_level = len(heading_match.group(1))
            current_section = heading_match.group(2).strip()
            current_content = []
        else:
            if current_section:
                current_content.append(line)
            else:
                # Content before first heading
                if not sections:
                    sections.append({
                        'title': 'Introduction',
                        'content': line,
                        'level': 1
                    })
                else:
                    sections[0]['content'] += '\n' + line
    
    # Save last section
    if current_section:
        sections.append({
            'title': current_section,
            'content': '\n'.join(current_content).strip(),
            'level': current_level
        })
    
    return {
        'sections': sections,
        'metadata': {
            'section_count': len(sections)
        }
    }


def extract_section(markdown: str, section_title: str) -> Optional[str]:
    """Extract a specific section from markdown"""
    sections = parse_markdown(markdown)['sections']
    
    for section in sections:
        if section['title'].lower() == section_title.lower():
            return f"# {section['title']}\n\n{section['content']}"
    
    return None


def replace_section(markdown: str, section_title: str, new_content: str) -> str:
    """Replace a section in markdown with new content"""
    sections = parse_markdown(markdown)['sections']
    
    found = False
    for i, section in enumerate(sections):
        if section['title'].lower() == section_title.lower():
            # Parse new content to get just the content part (remove heading)
            new_lines = new_content.split('\n')
            if new_lines and new_lines[0].startswith('#'):
                new_content_text = '\n'.join(new_lines[1:]).strip()
            else:
                new_content_text = new_content.strip()
            
            sections[i]['content'] = new_content_text
            found = True
            break
    
    if not found:
        # Add new section at the end
        sections.append({
            'title': section_title,
            'content': new_content.strip(),
            'level': 2
        })
    
    # Rebuild markdown
    return rebuild_markdown({'sections': sections})


def rebuild_markdown(parsed: Dict[str, Any]) -> str:
    """Rebuild markdown from parsed structure"""
    sections = parsed.get('sections', [])
    markdown_parts = []
    
    for section in sections:
        level = section.get('level', 2)
        heading = '#' * level
        markdown_parts.append(f"{heading} {section['title']}")
        if section.get('content'):
            markdown_parts.append(section['content'])
        markdown_parts.append('')  # Empty line between sections
    
    return '\n'.join(markdown_parts).strip()

