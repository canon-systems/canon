"""
Build system prompt for LLM based on customization settings
"""
from typing import Dict, Any, Optional, List

def build_system_prompt(
    config: Optional[Dict[str, Any]] = None,
    is_update: bool = False
) -> str:
    """Build the system prompt message based on prompt configuration"""
    base_prompt = []
    
    if is_update:
        base_prompt.extend([
            'You are a senior technical writer.',
            'You are updating existing documentation. The source code has changed, and you need to update the documentation accordingly.',
            'Maintain the same structure and style as much as possible, but reflect all code changes accurately.'
        ])
    else:
        base_prompt.extend([
            'You are a senior technical writer.',
            'Produce clear, well-structured Markdown documentation for the given codebase.'
        ])
    
    # Add personality
    personality_map = {
        'friendly': 'Write in a friendly, approachable tone. Be warm and welcoming to readers.',
        'concise': 'Be concise and direct. Get to the point quickly without unnecessary elaboration.',
        'detailed': 'Be thorough and detailed. Provide comprehensive explanations and context.',
        'conversational': 'Write in a conversational style, as if explaining to a colleague.',
        'formal': 'Write in a formal, academic style with precise language and structure.',
        'default': ''  # No additional personality instruction
    }
    
    if config and config.get('personality') and config['personality'] != 'default':
        personality = config['personality']
        personality_instruction = personality_map.get(personality, '')
        if personality_instruction:
            base_prompt.append(personality_instruction)
    
    # Add style
    style_map = {
        'beginner-friendly': 'Write for beginners. Explain concepts clearly, avoid jargon, and provide examples.',
        'expert-level': 'Write for experts. Assume deep technical knowledge and focus on advanced details.',
        'tutorial': 'Write in a tutorial style with step-by-step guidance and practical examples.',
        'reference': 'Write as a reference manual with clear sections, organized information, and quick lookup format.',
        'blog-post': 'Write in an engaging blog post style with narrative flow and storytelling elements.',
        'default': ''  # No additional style instruction
    }
    
    if config and config.get('style') and config['style'] != 'default':
        style = config['style']
        style_instruction = style_map.get(style, '')
        if style_instruction:
            base_prompt.append(style_instruction)
    
    # Add document structure requirements
    structure_config = config.get('document_structure') if config else None
    if structure_config and structure_config.get('sections'):
        sections = structure_config['sections']
        required_sections = [s for s in sections if s.get('required', False)]
        optional_sections = [s for s in sections if not s.get('required', False)]
        
        structure_instruction = 'Structure the documentation with the following sections:\n'
        
        for index, section in enumerate(sections, 1):
            required_text = ' (REQUIRED)' if section.get('required', False) else ' (optional)'
            structure_instruction += f'{index}. {section.get("title", "")}{required_text}'
            if section.get('description'):
                structure_instruction += f' - {section["description"]}'
            structure_instruction += '\n'
        
        if structure_config.get('includeTableOfContents'):
            structure_instruction += '\nInclude a table of contents at the beginning listing all sections.'
        
        if structure_config.get('customStructure'):
            structure_instruction += f'\nAdditional structure guidance: {structure_config["customStructure"]}'
        
        base_prompt.append(structure_instruction)
    else:
        # Default structure if no custom structure is provided
        base_prompt.append(
            'Include: overview, key components, data flow, API/CLI usage (if any), setup/run, and limitations.'
        )
    
    # Add standard requirements
    base_prompt.extend([
        'When helpful, include short code snippets or pseudo-diagrams.',
        'Use headings, subheadings, and bullet points. No HTML.'
    ])
    
    # Add custom instructions if provided
    if config and config.get('customInstructions') and config['customInstructions'].strip():
        base_prompt.append(f"Additional instructions: {config['customInstructions'].strip()}")
    
    return ' '.join(base_prompt)

