import { NextRequest, NextResponse } from 'next/server';
import { apiPost } from '@/lib/api/client';

/**
 * Proxy endpoint that forwards requests to the FastAPI backend
 * Maps frontend field names to backend field names
 */
export async function POST(request: NextRequest) {
  try {
    // Expect: { projectName, files: [{ path, content }], model?: string, promptConfig?: PromptConfig }
    const body = await request.json().catch(() => ({}));
    const projectName = String(body.projectName || 'Project');
    const files = Array.isArray(body.files) ? body.files : [];
    const model = body.model ? String(body.model) : undefined;
    const promptConfig = body.promptConfig || null;

    if (!files.length) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // Map frontend format to backend format
    // Frontend: { projectName, files, model, promptConfig }
    // Backend: { project_name, files, model, prompt_config }
    const backendRequest = {
      project_name: projectName,
      files: files.map((f: any) => ({
        path: String(f?.path || 'unknown'),
        content: String(f?.content || '')
      })),
      model: model,
      prompt_config: promptConfig ? {
        personality: promptConfig.personality,
        style: promptConfig.style,
        custom_instructions: promptConfig.customInstructions,
        temperature: promptConfig.temperature,
        document_structure: promptConfig.document_structure ? {
          sections: promptConfig.document_structure.sections,
          include_table_of_contents: promptConfig.document_structure.includeTableOfContents,
          custom_structure: promptConfig.document_structure.customStructure
        } : undefined
      } : undefined
    };

    // Call backend API
    // Note: generate-doc endpoint uses get_optional_user, so auth is optional
    const result = await apiPost<{ markdown: string; model?: string; prompt_config?: any }>(
      '/api/generate-doc',
      backendRequest,
      false // Auth not required when files are provided directly
    );

    return NextResponse.json({ markdown: result.markdown }, { status: 200 });
  } catch (err: any) {
    console.error('Generate doc error:', err);
    return NextResponse.json({ 
      error: 'Generator failed', 
      detail: err.message || String(err) 
    }, { status: 500 });
  }
}

