import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { analyzeRepository } from '@/lib/server/services/analyzeRepository';
import { generateDocumentation } from '@/lib/server/services/docGenerator';
import { generateArchitectureDiagram } from '@/lib/server/services/diagramGenerator';
import { trackRepoScan, trackDocGenerated, trackDiagramGenerated } from '@/lib/server/services/usageTracking';
import { createOrUpdateDocument } from '@/lib/server/services/documentService';

type AnalyzeRepoRequestBody = {
  generate_diagram?: boolean;
  model?: string;
};

type WorkspaceRepo = {
  id: string;
  name: string;
  repo_url: string;
  default_branch: string;
  settings?: Record<string, unknown>;
  workspace_id?: string;
};

/**
 * POST: Analyze and generate documentation for a repository
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as AnalyzeRepoRequestBody;
    const { generate_diagram = false, model } = body;

    if (!model) {
      return NextResponse.json({ error: 'model is required' }, { status: 400 });
    }

    const { data: repoData, error } = await supabase
      .from('workspace_repos')
      .select('*')
      .eq('id', id)
      .eq('workspace_id', user.id)
      .single();
    const repo = repoData as WorkspaceRepo | null;

    if (error || !repo) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
    }

    const repoSettings = (repo.settings || {}) as {
      subdir?: string | null;
      filters?: Record<string, unknown> | null;
      prompt_config?: Record<string, unknown> | null;
    };
    const subdir = repoSettings.subdir || null;
    const filters = repoSettings.filters || null;
    const promptConfig = repoSettings.prompt_config || null;

    const analysis = await analyzeRepository({
      supabase,
      userId: user.id,
      repoUrl: repo.repo_url,
      branch: repo.default_branch,
      subdir,
      filters,
    });

    await trackRepoScan(supabase, user.id, repo.id, repo.repo_url);

    const docResult = await generateDocumentation({
      supabase,
      userId: user.id,
      projectName: repo.name,
      model,
      files: analysis.rawFiles || [],
      repoUrl: repo.repo_url,
      branch: repo.default_branch,
      subdir,
      promptConfig,
    });

    // Get file paths from analysis
    const filePaths = (analysis.rawFiles || []).map(f => f.path);

    // Use the new documents system
    const { documentId } = await createOrUpdateDocument(
      supabase,
      repo.id, // workspace_repos.id
      repo.name,
      docResult.markdown,
      filePaths
    );

    const docId = documentId;
    await trackDocGenerated(supabase, user.id, docId || '', repo.id);

    let diagramId: string | null = null;

    if (generate_diagram && docId) {
      const diagramResult = await generateArchitectureDiagram({
        supabase,
        userId: user.id,
        method: 'github',
        repoUrl: repo.repo_url,
        branch: repo.default_branch,
        subdir,
        files: analysis.rawFiles || [],
        saveDiagram: true,
        title: `${repo.name} Architecture`,
      });

      if (diagramResult.diagram_id) {
        diagramId = diagramResult.diagram_id as string;
        await trackDiagramGenerated(supabase, user.id, diagramId, repo.id);
      }
    }

    return NextResponse.json(
      {
        success: true,
        doc_id: docId,
        diagram_id: diagramId,
        message: `Documentation generated and saved for ${repo.name}`,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('Analyze repo error:', err);
    return NextResponse.json(
      {
        error: 'Failed to analyze repository',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

