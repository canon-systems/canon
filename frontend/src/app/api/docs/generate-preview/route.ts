import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { generateDocumentation } from '@/lib/server/services/docGenerator';
import { trackDocGenerated } from '@/lib/server/services/usageTracking';
import type { PromptConfig } from '@/lib/server/prompts/buildSystemPrompt';
import { prepareFileSummaries } from '@/lib/server/services/prepareSummaries';
import { getDocument } from '@/lib/server/services/documentService';

type GeneratePreviewRequestBody = {
    submissionId: string;
    model: string;
    promptConfig?: PromptConfig;
    documentStructure?: any;
};

export const runtime = 'nodejs';

/**
 * Generate preview for document regeneration
 * This endpoint generates a preview of the regenerated documentation
 * and returns the significance analysis
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { user } = await getSession();
        const body = (await request.json().catch(() => ({}))) as GeneratePreviewRequestBody;

        const { submissionId, model, promptConfig, documentStructure } = body;

        if (!submissionId) {
            return NextResponse.json({ error: 'submissionId is required' }, { status: 400 });
        }

        if (!model) {
            return NextResponse.json({ error: 'model is required' }, { status: 400 });
        }

        // Get document to access repo information and regeneration settings
        const document = await getDocument(supabase, submissionId);
        if (!document) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        // Verify user has access
        const { data: repo } = await supabase
            .from('workspace_repos')
            .select('workspace_id, repo_url, default_branch')
            .eq('id', document.repo_id)
            .single();

        if (!repo || repo.workspace_id !== user?.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Get persisted regeneration settings from document
        const configuration = (document as any).configuration || {};

        // Use persisted settings as defaults, override with request body if provided
        const defaultModel = configuration.model || model;
        const defaultPromptConfig = promptConfig || configuration;
        const defaultDocumentStructure = documentStructure || configuration.documentStructure;

        // Get tracked files for this document
        const { data: documentFiles } = await supabase
            .from('document_files')
            .select('file_path')
            .eq('document_id', submissionId);

        const trackedFiles = (documentFiles || []).map(df => df.file_path);

        if (trackedFiles.length === 0) {
            return NextResponse.json({ error: 'No tracked files found for this document' }, { status: 400 });
        }

        // Prepare summaries if user is authenticated
        if (user?.id) {
            try {
                await prepareFileSummaries(supabase, submissionId, false, user.id);
            } catch (prepareError) {
                console.error('Failed to prepare summaries:', prepareError);
                // Continue anyway - will fallback to full content
            }
        }

        // Build the prompt config with document structure
        const fullPromptConfig = {
            ...defaultPromptConfig,
            document_structure: defaultDocumentStructure
        };

        // Generate preview documentation
        const result = await generateDocumentation({
            supabase,
            userId: user?.id || null,
            projectName: document.title || 'Project',
            model: defaultModel,
            files: [], // Will be populated from repo
            repoUrl: repo.repo_url,
            branch: repo.default_branch || 'main',
            subdir: null,
            promptConfig: fullPromptConfig,
            useSummaries: true, // Always use summaries for previews
            submissionId,
        });

        if (user?.id) {
            await trackDocGenerated(supabase, user.id, submissionId, document.repo_id, false);
        }

        // Analyze significance of changes
        const significanceAnalysis = await analyzeSignificance(
            document.content || '',
            result.markdown,
            trackedFiles
        );

        return NextResponse.json({
            markdown: result.markdown,
            model: defaultModel,
            promptConfig: fullPromptConfig,
            significanceAnalysis
        });

    } catch (err: any) {
        console.error('Generate preview error:', err);
        return NextResponse.json(
            {
                error: 'Preview generation failed',
                detail: err.message || String(err),
            },
            { status: 500 }
        );
    }
}

/**
 * Analyze the significance of changes between original and new content
 */
async function analyzeSignificance(originalContent: string, newContent: string, trackedFiles: string[]) {
    // Simple significance analysis
    const originalLength = originalContent.length;
    const newLength = newContent.length;
    const lengthDifference = Math.abs(newLength - originalLength);
    const lengthChangePercent = originalLength > 0 ? (lengthDifference / originalLength) * 100 : 0;

    // Count sections (rough approximation using headers)
    const originalSections = (originalContent.match(/^#{1,6}\s/gm) || []).length;
    const newSections = (newContent.match(/^#{1,6}\s/gm) || []).length;

    // Determine significance
    let isSignificant = false;
    let significanceLevel = 'minor';
    let reason = '';
    let summary = '';

    if (lengthChangePercent > 50 || Math.abs(newSections - originalSections) > 3) {
        isSignificant = true;
        significanceLevel = 'major';
        reason = 'Significant content changes detected';
        summary = `Content length changed by ${lengthChangePercent.toFixed(1)}%, sections changed from ${originalSections} to ${newSections}`;
    } else if (lengthChangePercent > 20 || Math.abs(newSections - originalSections) > 1) {
        isSignificant = true;
        significanceLevel = 'moderate';
        reason = 'Moderate content changes detected';
        summary = `Content length changed by ${lengthChangePercent.toFixed(1)}%, sections changed from ${originalSections} to ${newSections}`;
    } else if (lengthChangePercent > 5) {
        significanceLevel = 'minor';
        reason = 'Minor content changes detected';
        summary = `Content length changed by ${lengthChangePercent.toFixed(1)}%`;
    } else {
        reason = 'Minimal changes detected';
        summary = 'Content appears largely unchanged';
    }

    return {
        isSignificant,
        reason,
        summary,
        technicalChanges: {
            level: significanceLevel,
            description: `${lengthChangePercent.toFixed(1)}% content change`
        },
        businessLogicChanges: {
            level: significanceLevel,
            description: `${Math.abs(newSections - originalSections)} section changes`
        },
        unavailableFiles: [] // Could be populated if file access fails
    };
}
