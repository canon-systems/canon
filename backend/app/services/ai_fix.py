"""
AI Fix Service - Uses AI to improve documentation
"""
from typing import Dict, Optional, Any
from supabase import Client
from app.services.llm_gateway import LLMGateway
from app.utils.markdown_parser import extract_section, replace_section

async def apply_ai_fix_to_doc(
    supabase: Client,
    user_id: str,
    model: str,
    doc_id: Optional[str] = None,
    markdown_content: Optional[str] = None,
    section: Optional[str] = None,
    issue: Optional[str] = None,
    instruction: Optional[str] = None
) -> Dict[str, Any]:
    """
    Use AI to improve or fix a portion of the documentation.
    """
    if not model:
        raise ValueError("Model is required")
    
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
    
    # Build prompt based on what needs fixing
    if section and issue:
        # Fix specific section with issue description
        section_content = extract_section(markdown_content, section)
        if not section_content:
            raise ValueError(f"Section '{section}' not found")
        
        prompt = f"""Here is a documentation section that needs improvement:

{section_content}

Issue: {issue}

Please rewrite this section to address the issue. Make it clearer, fix any grammar issues, and ensure the instructions are easy to follow. Return only the improved section text, maintaining the same heading level."""
        
        fixed_section = await _call_ai_for_fix(prompt, model)
        new_markdown = replace_section(markdown_content, section, fixed_section)
        
    elif instruction:
        # Generic instruction (e.g., "proofread for grammar")
        if instruction.lower() in ['proofread', 'proofread for grammar', 'fix grammar']:
            prompt = f"""Please proofread and improve the following documentation for grammar, clarity, and correctness:

{markdown_content}

Return the improved documentation in full."""
        else:
            prompt = f"""Please improve the following documentation based on this instruction: {instruction}

{markdown_content}

Return the improved documentation in full."""
        
        new_markdown = await _call_ai_for_fix(prompt, model)
        fixed_section = None
    else:
        raise ValueError("Either 'section' and 'issue', or 'instruction' must be provided")
    
    return {
        'markdown': new_markdown,
        'fixed_section': fixed_section
    }


async def _call_ai_for_fix(prompt: str, model: str) -> str:
    """Call AI to fix documentation"""
    gateway = LLMGateway()
    
    messages = [
        {
            'role': 'system',
            'content': 'You are a technical writing expert. Improve documentation for clarity, accuracy, and readability. Maintain the same structure and technical accuracy.'
        },
        {
            'role': 'user',
            'content': prompt
        }
    ]
    
    result = await gateway.call(messages, model=model)
    return result.strip()

