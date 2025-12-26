import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { TreeSitterAnalyzer } from '@/lib/server/services/treeSitterAnalyzer';
import { trackArchitectureDiagram } from '@/lib/server/services/usageTracking';

export async function POST(request: NextRequest) {
    try {
        const { user } = await getSession();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();
        const body = await request.json().catch(() => ({}));
        const { repoId, forceCreate } = body;

        if (!repoId) {
            return NextResponse.json({ error: 'repoId is required' }, { status: 400 });
        }

        // Verify user owns this repository
        const { data: repo, error: repoError } = await supabase
            .from('workspace_repos')
            .select('*')
            .eq('id', repoId)
            .eq('workspace_id', user.id)
            .single();

        if (repoError || !repo) {
            return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
        }

        // Get repository setup status
        const { data: repoSetup, error: setupError } = await supabase
            .from('repository_setup')
            .select('*')
            .eq('repo_id', repoId)
            .single();

        if (setupError || !repoSetup || repoSetup.setup_status !== 'ready') {
            return NextResponse.json({
                error: 'Repository setup not completed. Please complete repository setup to generate architecture diagrams.'
            }, { status: 400 });
        }

        // For architecture diagrams, we don't need file summaries
        // Tree-sitter will fetch and analyze the actual source code directly from GitHub

        // Fetch actual file content from the repository
        const { analyzeRepository } = await import('@/lib/server/services/analyzeRepository');

        // Get file list from repository analysis
        const analysis = await analyzeRepository({
            supabase,
            userId: user.id,
            repoUrl: repo.repo_url,
            branch: repoSetup.branch,
        });

        if (!analysis.success || !analysis.rawFiles) {
            return NextResponse.json({
                error: 'Failed to fetch repository files'
            }, { status: 400 });
        }

        // Filter to supported languages and prepare for analysis
        const supportedExtensions = ['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'go', 'rs', 'cpp', 'c', 'cs', 'php', 'rb'];
        const codeFiles = analysis.rawFiles.filter(file => {
            const ext = file.path.split('.').pop()?.toLowerCase();
            return supportedExtensions.includes(ext || '');
        });

        if (codeFiles.length === 0) {
            return NextResponse.json({
                error: 'No supported code files found in repository'
            }, { status: 400 });
        }

        const analyzer = new TreeSitterAnalyzer();
        const manifestFiles = analysis.rawFiles.filter(file => {
            const lower = file.path.toLowerCase();
            return lower.endsWith('package.json') ||
                lower.endsWith('requirements.txt') ||
                lower.endsWith('pipfile') ||
                lower.endsWith('pyproject.toml') ||
                lower.endsWith('go.mod') ||
                lower.endsWith('cargo.toml') ||
                lower.endsWith('pom.xml') ||
                lower.endsWith('build.gradle') ||
                lower.endsWith('build.gradle.kts') ||
                lower.endsWith('composer.json') ||
                lower.endsWith('gemfile') ||
                lower.endsWith('gemfile.lock') ||
                lower.endsWith('.csproj') ||
                lower.endsWith('package.swift');
        });

        // Analyze architecture using Tree-sitter only
        const architectureAnalysis = await analyzer.analyzeRepository(supabase, repoId, codeFiles, manifestFiles);

        // Check if a diagram already exists for this repository
        let existingDiagram = null;
        if (!forceCreate) {
            const { data: existing, error: findError } = await supabase
                .from('diagrams')
                .select('id')
                .eq('repo_id', repoId)
                .eq('diagram_type', 'architecture')
                .single();

            if (!findError && existing) {
                existingDiagram = existing;
            }
        }

        let diagram;
        let isNew = false;

        if (existingDiagram && !forceCreate) {
            // Update existing diagram
            const { data: updated, error: updateError } = await supabase
                .from('diagrams')
                .update({
                    title: `Architecture Diagram - ${repo.name}`,
                    content: architectureAnalysis.mermaid,
                    analysis_data: architectureAnalysis,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingDiagram.id)
                .select()
                .single();

            if (updateError) {
                console.error('Failed to update diagram:', updateError);
                return NextResponse.json({
                    error: 'Failed to update diagram'
                }, { status: 500 });
            }

            diagram = updated;
            isNew = false;
        } else {
            // Create new diagram
            const { data: inserted, error: insertError } = await supabase
                .from('diagrams')
                .insert({
                    repo_id: repoId,
                    title: `Architecture Diagram - ${repo.name}`,
                    diagram_type: 'architecture',
                    content: architectureAnalysis.mermaid,
                    analysis_data: architectureAnalysis
                })
                .select()
                .single();

            if (insertError) {
                console.error('Failed to store diagram:', insertError);
                return NextResponse.json({
                    error: 'Failed to save diagram'
                }, { status: 500 });
            }

            diagram = inserted;
            isNew = true;
        }

        await trackArchitectureDiagram(
            supabase,
            user.id,
            repoId,
            diagram.id,
            isNew,
            architectureAnalysis.components.length,
            architectureAnalysis.relationships.length,
            repo.repo_url,
            repoSetup?.branch || repo.default_branch
        );

        return NextResponse.json({
            success: true,
            diagramId: diagram.id,
            diagram: architectureAnalysis.mermaid,
            components: architectureAnalysis.components.length,
            relationships: architectureAnalysis.relationships.length,
            isNew
        });

    } catch (error: any) {
        console.error('Architecture diagram generation error:', error);
        return NextResponse.json(
            {
                error: 'Failed to generate architecture diagram',
                detail: error.message
            },
            { status: 500 }
        );
    }
}
