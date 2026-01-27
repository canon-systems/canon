import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { TreeSitterAnalyzer } from '@/lib/server/services/treeSitterAnalyzer';
import { trackArchitectureDiagram } from '@/lib/server/services/usageTracking';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
    try {
        const { user } = await getSession();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();
        const body = await request.json().catch(() => ({}));
        const { repoIds, sourceIds, forceCreate } = body;

        const sourceIdArray: string[] = Array.isArray(sourceIds)
            ? sourceIds.filter(Boolean)
            : Array.isArray(repoIds)
                ? repoIds.filter(Boolean)
                : [];

        if (!sourceIdArray.length) {
            return NextResponse.json({ error: 'sourceIds is required' }, { status: 400 });
        }

        // Load all repos and verify ownership/setup
        const repos: Array<{
            repo: {
                id: string;
                name: string;
                repo_url?: string;
                external_url?: string;
                default_branch: string;
                user_id: string;
                [key: string]: unknown;
            };
            setup: {
                source_id: string;
                setup_status: string;
                branch?: string;
                [key: string]: unknown;
            };
        }> = [];
        for (const rid of sourceIdArray) {
            const { data: repo, error: repoError } = await supabase
                .from('workspace_sources')
                .select('*')
                .eq('id', rid)
                .eq('user_id', user.id)
                .single();

            if (repoError || !repo) {
                return NextResponse.json({ error: `Repository not found: ${rid}` }, { status: 404 });
            }

            const { data: repoSetup, error: setupError } = await supabase
                .from('source_setup')
                .select('*')
                .eq('source_id', rid)
                .single();

            if (setupError || !repoSetup || repoSetup.setup_status !== 'ready') {
                return NextResponse.json({
                    error: `Repository setup not completed for ${repo.name || rid}`
                }, { status: 400 });
            }

            repos.push({ repo, setup: repoSetup });
        }

        const primaryRepo = repos[0].repo;
        const primarySetup = repos[0].setup;

        // For architecture diagrams, we don't need file summaries
        // Tree-sitter will fetch and analyze the actual source code directly from GitHub

        const { analyzeRepository } = await import('@/lib/server/services/analyzeRepository');

        const supportedExtensions = ['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'go', 'rs', 'cpp', 'c', 'cs', 'php', 'rb'];

        const allCodeFiles: Array<{ path: string; content: string }> = [];
        const allManifestFiles: Array<{ path: string; content: string }> = [];

        const slugForRepo = (repoUrl: string, fallback: string) => {
            try {
                const cleaned = repoUrl.replace(/\.git$/, '');
                const parts = cleaned.split('/').filter(Boolean);
                const owner = parts[parts.length - 2];
                const name = parts[parts.length - 1];
                return owner && name ? `${owner}/${name}` : fallback;
            } catch {
                return fallback;
            }
        };

        for (const { repo, setup } of repos) {
            const repoUrl = repo.repo_url || repo.external_url;
            if (!repoUrl) {
                return NextResponse.json({
                    error: `Repository URL not found for ${repo.name}`
                }, { status: 400 });
            }

            const branch = setup.branch || repo.default_branch;
            if (!branch) {
                return NextResponse.json({
                    error: `Branch not found for ${repo.name}`
                }, { status: 400 });
            }

            const analysis = await analyzeRepository({
                supabase,
                userId: user.id,
                repoUrl,
                branch,
            });

            if (!analysis.success || !analysis.rawFiles) {
                return NextResponse.json({
                    error: `Failed to fetch repository files for ${repo.name}`
                }, { status: 400 });
            }

            const slug = slugForRepo(repoUrl, repo.name || repo.id);

            const codeFiles = analysis.rawFiles
                .filter(file => {
                    const ext = file.path.split('.').pop()?.toLowerCase();
                    return supportedExtensions.includes(ext || '');
                })
                .map(file => ({
                    path: `${slug}/${file.path}`,
                    content: file.content
                }));

            const manifestFiles = analysis.rawFiles
                .filter(file => {
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
                })
                .map(file => ({
                    path: `${slug}/${file.path}`,
                    content: file.content
                }));

            allCodeFiles.push(...codeFiles);
            allManifestFiles.push(...manifestFiles);
        }

        if (allCodeFiles.length === 0) {
            return NextResponse.json({
                error: 'No supported code files found in selected repositories'
            }, { status: 400 });
        }

        const analyzer = new TreeSitterAnalyzer();

        // Analyze architecture using Tree-sitter only
        const architectureAnalysis = await analyzer.analyzeRepository(
            supabase,
            primaryRepo.id,
            allCodeFiles,
            allManifestFiles
        );

        // Fetch Supabase tables (service role) for visualization and link to Supabase node
        const baseHighNodes = architectureAnalysis.highLevelNodes || [];
        const baseFullNodes = architectureAnalysis.fullNodes || baseHighNodes;
        const baseHighEdges = architectureAnalysis.highLevelEdges || [];
        const baseFullEdges = architectureAnalysis.fullEdges || baseHighEdges;

        let tableNodes: Array<{
            id: string;
            label: string;
            type: 'internal' | 'external';
            category: string;
            files?: string[];
            packages?: string[];
            source?: string;
        }> = [];
        try {
            const admin = createServiceRoleClient();
            // Try information_schema first
            let tables: Array<{ table_schema: string; table_name: string }> | null = null;
            let tableError: Error | null = null;
            const infoRes = await admin
                .from('information_schema.tables')
                .select('table_schema, table_name')
                .eq('table_schema', 'public');
            if (!infoRes.error && infoRes.data) {
                tables = infoRes.data;
            } else {
                tableError = infoRes.error;
                // Fallback to pg_catalog.pg_tables
                const pgRes = await admin
                    .from('pg_catalog.pg_tables')
                    .select('schemaname, tablename')
                    .eq('schemaname', 'public');
                if (!pgRes.error && pgRes.data) {
                    tables = pgRes.data.map((t: { schemaname: string; tablename: string }) => ({
                        table_schema: t.schemaname,
                        table_name: t.tablename
                    }));
                    tableError = null;
                } else if (pgRes.error) {
                    tableError = pgRes.error;
                }
            }

            if (!tableError && tables?.length) {
                tableNodes = tables.map((t: { table_schema: string; table_name: string }) => ({
                    id: `table:${t.table_schema}.${t.table_name}`,
                    label: `${t.table_name}`,
                    type: 'internal',
                    category: 'db',
                    source: 'supabase'
                }));
            } else if (tableError) {
                console.warn('Failed to load Supabase tables for diagram', tableError);
            }
        } catch (err) {
            console.warn('Failed to load Supabase tables for diagram', err);
        }

        const hasSupabaseNode = [...baseFullNodes, ...tableNodes].some((n) => n.id === 'supabase');
        const supabaseNode = hasSupabaseNode
            ? null
            : {
                  id: 'supabase',
                  label: 'Supabase',
                  type: 'external',
                  category: 'db',
                  packages: ['@supabase/supabase-js', 'supabase'],
                  fileCount: 0,
                  source: 'supabase'
              };

        const tableEdges = tableNodes.map((t) => ({
            from: 'supabase',
            to: t.id,
            kind: 'internal' as const,
            strength: 1
        }));

        const augmentedHighNodes = [...baseHighNodes, ...(supabaseNode ? [supabaseNode] : []), ...tableNodes];
        const augmentedFullNodes = [...baseFullNodes, ...(supabaseNode ? [supabaseNode] : []), ...tableNodes];
        const augmentedHighEdges = [...baseHighEdges, ...tableEdges];
        const augmentedFullEdges = [...baseFullEdges, ...tableEdges];

        const augmentedAnalysis = {
            ...architectureAnalysis,
            highLevelNodes: augmentedHighNodes,
            highLevelEdges: augmentedHighEdges,
            fullNodes: augmentedFullNodes,
            fullEdges: augmentedFullEdges,
        };

        // Check if a diagram already exists for this repository
        let existingDiagram = null;
        if (!forceCreate) {
            const { data: existing, error: findError } = await supabase
                .from('diagrams')
                .select('id')
                .eq('source_id', primaryRepo.id)
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
                    title: repos.length > 1
                        ? `Architecture Diagram - ${repos.length} repos`
                        : `Architecture Diagram - ${primaryRepo.name}`,
                    content: augmentedAnalysis.mermaid,
                    analysis_data: {
                        ...augmentedAnalysis,
                        source_repo_ids: sourceIdArray
                    },
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
                    source_id: primaryRepo.id,
                    source_repo_ids: sourceIdArray,
                    title: repos.length > 1
                        ? `Architecture Diagram - ${repos.length} repos`
                        : `Architecture Diagram - ${primaryRepo.name}`,
                    diagram_type: 'architecture',
                    content: augmentedAnalysis.mermaid,
                    analysis_data: {
                        ...augmentedAnalysis,
                        source_repo_ids: sourceIdArray
                    }
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
            primaryRepo.id,
            diagram.id,
            isNew,
            primaryRepo.repo_url || primaryRepo.external_url,
            primarySetup?.branch || primaryRepo.default_branch
        );

        return NextResponse.json({
            success: true,
            diagramId: diagram.id,
            diagram: architectureAnalysis.mermaid,
            isNew
        });

    } catch (error: unknown) {
        console.error('Architecture diagram generation error:', error);
        return NextResponse.json(
            {
                error: 'Failed to generate architecture diagram',
                detail: error instanceof Error ? error.message : String(error)
            },
            { status: 500 }
        );
    }
}
