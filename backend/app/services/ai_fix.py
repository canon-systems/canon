"""
AI Fix Service - Uses AI to improve documentation
"""
from typing import Dict, Optional, Any, AsyncIterator
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

async def stream_ai_fix_to_doc(
    supabase: Client,
    user_id: str,
    model: str,
    doc_id: Optional[str] = None,
    markdown_content: Optional[str] = None,
    section: Optional[str] = None,
    issue: Optional[str] = None,
    instruction: Optional[str] = None
) -> AsyncIterator[str]:
    """
    Stream AI improvements to documentation.
    Yields chunks of the improved content.
    """
    if not model:
        raise ValueError("Model is required")
    
    # Get markdown content
    original_markdown = markdown_content
    if doc_id and not markdown_content:
        try:
            doc = supabase.table('submissions').select('markdown').eq('id', doc_id).single().execute()
            if not doc.data:
                raise ValueError(f"Document {doc_id} not found")
            original_markdown = doc.data.get('markdown', '')
        except Exception as e:
            raise ValueError(f"Error loading document: {e}")
    
    if not original_markdown:
        raise ValueError("markdown_content is required")
    
    gateway = LLMGateway()
    
    # Build prompt based on what needs fixing
    if section and issue:
        # Fix specific section with issue description
        section_content = extract_section(original_markdown, section)
        if not section_content:
            raise ValueError(f"Section '{section}' not found")
        
        prompt = f"""Here is a documentation section that needs improvement:

{section_content}

Issue: {issue}

Please rewrite this section to address the issue. Make it clearer, fix any grammar issues, and ensure the instructions are easy to follow. Return only the improved section text, maintaining the same heading level."""
        
        # Stream the improved section
        improved_section = ""
        chunk_count = 0
        async for chunk in gateway.stream(
            [
                {
                    'role': 'system',
                    'content': 'You are a technical writing expert. Improve documentation for clarity, accuracy, and readability. Maintain the same structure and technical accuracy.'
                },
                {
                    'role': 'user',
                    'content': prompt
                }
            ],
            model=model
        ):
            improved_section += chunk
            chunk_count += 1
            # Replace section in full markdown and yield the complete updated markdown
            try:
                new_markdown = replace_section(original_markdown, section, improved_section)
                yield new_markdown
            except Exception as e:
                # If replacement fails, just yield the improved section for now
                print(f"AI Fix: Section replacement failed: {e}, yielding improved section")
                yield improved_section
        
        print(f"AI Fix: Section stream completed. Total chunks: {chunk_count}, final length: {len(improved_section)}")
        
    elif instruction:
        # When instruction is provided with selected text, only modify the selected section
        if section:
            # Find the section containing the selected text
            section_content = None
            section_title = None
            
            # Try to extract by section title first
            section_content = extract_section(original_markdown, section)
            
            # If not found, search for the section containing the selected text
            if not section_content:
                from app.utils.markdown_parser import parse_markdown
                parsed = parse_markdown(original_markdown)
                sections = parsed.get('sections', [])
                
                # Find section that contains the selected text
                for sec in sections:
                    full_section_text = f"{sec['title']}\n{sec['content']}"
                    if section in full_section_text or section in sec['content']:
                        section_title = sec['title']
                        section_content = f"# {sec['title']}\n\n{sec['content']}"
                        break
                
                # If still not found, use selected text as the section content
                if not section_content:
                    section_content = section
                    section_title = section.split('\n')[0].replace('#', '').strip()
            
            prompt = f"""Here is a documentation section that needs improvement:

{section_content}

Instruction: {instruction}

Please rewrite this section according to the instruction. Make it clearer, fix any grammar issues, and ensure the instructions are easy to follow. Return only the improved section text, maintaining the same heading level and structure."""
            
            # Stream the improved section
            improved_section = ""
            chunk_count = 0
            async for chunk in gateway.stream(
                [
                    {
                        'role': 'system',
                        'content': 'You are a technical writing expert. Improve documentation for clarity, accuracy, and readability. Maintain the same structure and technical accuracy.'
                    },
                    {
                        'role': 'user',
                        'content': prompt
                    }
                ],
                model=model
            ):
                improved_section += chunk
                chunk_count += 1
                # Replace section in full markdown and yield the complete updated markdown
                try:
                    # Try to replace using section title if we found it
                    if section_title:
                        new_markdown = replace_section(original_markdown, section_title, improved_section)
                    else:
                        # Try to replace by finding the original section content
                        if section_content and section_content in original_markdown:
                            new_markdown = original_markdown.replace(section_content, improved_section, 1)
                        elif section in original_markdown:
                            new_markdown = original_markdown.replace(section, improved_section, 1)
                        else:
                            # Last resort: just prepend/append
                            new_markdown = original_markdown
                    yield new_markdown
                except Exception as e:
                    # If replacement fails, try to replace by content match
                    print(f"AI Fix: Section replacement failed: {e}, trying content match")
                    # Fallback: replace the section content directly
                    if section_content and section_content in original_markdown:
                        new_markdown = original_markdown.replace(section_content, improved_section, 1)
                        yield new_markdown
                    elif section in original_markdown:
                        new_markdown = original_markdown.replace(section, improved_section, 1)
                        yield new_markdown
                    else:
                        yield improved_section
            
            print(f"AI Fix: Section stream completed. Total chunks: {chunk_count}, final length: {len(improved_section)}")
        else:
            # No section provided - improve entire document (fallback)
            if instruction.lower() in ['proofread', 'proofread for grammar', 'fix grammar']:
                prompt = f"""Please proofread and improve the following documentation for grammar, clarity, and correctness:

{original_markdown}

Return the improved documentation in full."""
            else:
                prompt = f"""Please improve the following documentation based on this instruction: {instruction}

{original_markdown}

Return the improved documentation in full."""
            
            # Stream the improved full document - accumulate chunks and yield full document
            accumulated = ""
            chunk_count = 0
            async for chunk in gateway.stream(
                [
                    {
                        'role': 'system',
                        'content': 'You are a technical writing expert. Improve documentation for clarity, accuracy, and readability. Maintain the same structure and technical accuracy.'
                    },
                    {
                        'role': 'user',
                        'content': prompt
                    }
                ],
                model=model
            ):
                accumulated += chunk
                chunk_count += 1
                yield accumulated
            
            print(f"AI Fix: Instruction stream completed. Total chunks: {chunk_count}, final length: {len(accumulated)}")
    else:
        raise ValueError("Either 'section' and 'issue', or 'instruction' must be provided")

