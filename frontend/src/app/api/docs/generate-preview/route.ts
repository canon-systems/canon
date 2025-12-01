import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { getUserOctokit } from '@/lib/server/github/getUserOctokit';
import { buildSystemPrompt } from '@/lib/server/prompts/buildSystemPrompt';
import { detectRepositoryChanges } from '@/lib/server/services/changeDetector';
import { analyzeChangeSignificance } from '@/lib/server/services/changeSignificanceAnalyzer';
import { parseRepoUrl } from '@/lib/server/github/github';

const VERCEL_AI_GATEWAY_URL = process.env.VERCEL_AI_GATEWAY_URL;
const VERCEL_AI_GATEWAY_API_KEY = process.env.VERCEL_AI_GATEWAY_API_KEY;

/**
 * Normalize repo URL to repo_id format for database queries
 */
function normalizeRepoId(repoUrl: string): string {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) {
    throw new Error(`Invalid repo URL: ${repoUrl}`);
  }
  return `github.com/${parsed.owner}/${parsed.repo}`;
}

async function callGateway(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  model: string,
  temperature?: number
) {
  if (!VERCEL_AI_GATEWAY_URL || !VERCEL_AI_GATEWAY_API_KEY) {
    throw new Error('Gateway env vars missing');
  }

  if (!model) {
    throw new Error('Model is required');
  }

  const modelToUse = model;
  const temperatureToUse = temperature !== undefined ? temperature : 0.3;

  const r = await fetch(`${VERCEL_AI_GATEWAY_URL.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${VERCEL_AI_GATEWAY_API_KEY}`,
      'x-vercel-ai-key': VERCEL_AI_GATEWAY_API_KEY
    },
    body: JSON.stringify({
      model: modelToUse,
      temperature: temperatureToUse,
      messages
    })
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(j?.error?.message || j?.message || `LLM HTTP ${r.status}`);
  }
  return String(j?.choices?.[0]?.message?.content ?? '');
}


export async function POST(request: NextRequest) {
  try {
    const startTime = Date.now();
    const body = await request.json().catch(() => ({}));
    const { submissionId, model, promptConfig, skipSignificanceCheck } = body as {
      submissionId: string;
      model: string;
      promptConfig?: any;
      skipSignificanceCheck?: boolean;
    };

    if (!submissionId) {
      return NextResponse.json({ error: 'submissionId is required' }, { status: 400 });
    }

    if (!model) {
      return NextResponse.json({ error: 'model is required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { user } = await getSession();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Support both documentId and submissionId for backward compatibility
    const documentId = submissionId;
    
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, repo_id')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Get repo details and settings
    const { data: repo, error: repoError } = await supabase
      .from('workspace_repos')
      .select('repo_url, default_branch, workspace_id, settings')
      .eq('id', document.repo_id)
      .single();

    if (repoError || !repo) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
    }

    // Verify user has access
    if (repo.workspace_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get document title
    const { data: fullDocument } = await supabase
      .from('documents')
      .select('title')
      .eq('id', documentId)
      .single();

    const documentTitle = fullDocument?.title || 'Documentation';

    // Extract settings from repo
    const repoSettings = (repo.settings || {}) as {
      llm_prompt_config?: any;
      model?: string;
      document_structure?: any;
    };

    const repoUrl = repo.repo_url;
    const branch = repo.default_branch || 'main';

    if (!repoUrl) {
      return NextResponse.json({ error: 'Repository URL not found' }, { status: 400 });
    }

    const repoInfo = parseRepoUrl(repoUrl);
    if (!repoInfo) {
      return NextResponse.json({ error: `Failed to parse repository URL: ${repoUrl}` }, { status: 400 });
    }

    // Get tracked files from document_files
    const { data: documentFiles } = await supabase
      .from('document_files')
      .select('file_path')
      .eq('document_id', documentId);

    const selectedFiles: string[] = (documentFiles || []).map(df => df.file_path);
    if (selectedFiles.length === 0) {
      return NextResponse.json({ error: 'No files tracked for this document' }, { status: 400 });
    }

    const repoId = normalizeRepoId(repoUrl);

    // OPTIMIZATION: Load existing summaries from database in ONE bulk query
    // This replaces the slow prepareFileSummaries which was fetching files one-by-one
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [generate-preview] Regenerating preview for document: ${documentTitle} (${documentId})`);
    console.log(`[${timestamp}] [generate-preview] Reason: User requested preview regeneration`);
    console.log(`[${timestamp}] [generate-preview] Files tracked: ${selectedFiles.length} file(s) - ${selectedFiles.slice(0, 5).join(', ')}${selectedFiles.length > 5 ? ` ... and ${selectedFiles.length - 5} more` : ''}`);
    console.log(`[${timestamp}] [generate-preview] Loading summaries for ${selectedFiles.length} files...`);
    const summaryStart = Date.now();

    const { data: existingSummaries, error: summaryError } = await supabase
      .from('repo_file_summaries')
      .select('file_path, summary_text, summary_json')
      .ilike('repo_id', repoId)
      .eq('branch', branch)
      .in('file_path', selectedFiles);

    if (summaryError) {
      console.error('Failed to load summaries:', summaryError);
    }

    const summariesMap = new Map<string, { summary_text: string; summary_json: any }>();
    for (const s of existingSummaries || []) {
      summariesMap.set(s.file_path, { summary_text: s.summary_text, summary_json: s.summary_json });
    }
    const timestamp2 = new Date().toISOString();
    console.log(`[${timestamp2}] [generate-preview] Loaded ${summariesMap.size} summaries in ${Date.now() - summaryStart}ms`);

    // Check which files are missing summaries
    const filesWithSummaries = selectedFiles.filter(f => summariesMap.has(f));
    const filesMissingSummaries = selectedFiles.filter(f => !summariesMap.has(f));

    // OPTIMIZATION: Only fetch files that don't have summaries, and do it in PARALLEL
    let filesForDoc: Array<{ path: string; content: string }> = [];

    if (filesMissingSummaries.length > 0) {
      const timestamp3 = new Date().toISOString();
      console.log(`[${timestamp3}] [generate-preview] Fetching ${filesMissingSummaries.length} files missing summaries in parallel...`);
      console.log(`[${timestamp3}] [generate-preview] Files without summaries: ${filesMissingSummaries.slice(0, 5).join(', ')}${filesMissingSummaries.length > 5 ? ` ... and ${filesMissingSummaries.length - 5} more` : ''}`);
      const fetchStart = Date.now();
      const octokit = await getUserOctokit(supabase, user.id);
      const MAX_PER_FILE = 200_000;

      // Fetch all missing files in parallel
      const fetchPromises = filesMissingSummaries.map(async (filePath) => {
        try {
          const { data } = await octokit.repos.getContent({
            owner: repoInfo.owner,
            repo: repoInfo.repo,
            path: filePath,
            ref: branch
          });

          if (!Array.isArray(data) && data.type === 'file' && 'content' in data && typeof data.content === 'string') {
            const content = Buffer.from(data.content, 'base64').toString('utf-8');
            const clipped = content.length > MAX_PER_FILE ? content.slice(0, MAX_PER_FILE) : content;
            return { path: filePath, content: clipped };
          }
        } catch (e) {
          console.error(`Failed to fetch ${filePath}:`, e);
        }
        return null;
      });

      const fetchedFiles = (await Promise.all(fetchPromises)).filter((f): f is { path: string; content: string } => f !== null);
      filesForDoc = fetchedFiles;
      const timestamp4 = new Date().toISOString();
      console.log(`[${timestamp4}] [generate-preview] Fetched ${filesForDoc.length} files in ${Date.now() - fetchStart}ms`);
    }

    // Build content for documentation using summaries for files that have them
    // and full content for files that don't
    const docsContent: Array<{ path: string; content: string; hasSummary: boolean }> = [];

    // Add files with summaries (use summary_text which is more concise)
    for (const filePath of filesWithSummaries) {
      const summary = summariesMap.get(filePath);
      if (summary) {
        // Use summary_text for concise representation
        docsContent.push({
          path: filePath,
          content: `[Summary]\n${summary.summary_text}`,
          hasSummary: true
        });
      }
    }

    // Add files without summaries (use full content)
    for (const file of filesForDoc) {
      docsContent.push({ path: file.path, content: file.content, hasSummary: false });
    }

    if (docsContent.length === 0) {
      return NextResponse.json({ error: 'Could not fetch any file contents or summaries' }, { status: 500 });
    }

    // OPTIMIZATION: Run significance analysis in parallel with preparing content (if not skipped)
    let significanceAnalysis: any = null;
    let changesDetected = false;

    const significancePromise = (async () => {
      if (skipSignificanceCheck) {
        return { significanceAnalysis: null, changesDetected: false };
      }

      try {
        const changeDetection = await detectRepositoryChanges({
          supabase,
          userId: user.id,
          repoUrl,
          branch,
        });

        if (changeDetection.has_changes) {
          const trackedFilesSet = new Set(selectedFiles);
          const relevantRenames = changeDetection.files_renamed.filter(rename =>
            trackedFilesSet.has(rename.old_path) || trackedFilesSet.has(rename.new_path)
          );
          const relevantChanges = changeDetection.files_changed.filter(change => {
            if (change.status === 'renamed') {
              return trackedFilesSet.has(change.old_path!) || trackedFilesSet.has(change.path);
            }
            return trackedFilesSet.has(change.path);
          });

          if (relevantChanges.length > 0) {
            const analysis = await analyzeChangeSignificance(
              supabase,
              user.id,
              repoUrl,
              branch,
              changeDetection.old_commit_sha,
              changeDetection.current_commit_sha,
              relevantChanges.map(change => ({
                path: change.path,
                oldHash: change.old_hash || null,
                newHash: change.new_hash || null,
                old_path: change.old_path,
                status: change.status,
              })),
              { model: model || 'gpt-4o-mini' }
            );
            return { significanceAnalysis: analysis, changesDetected: true };
          } else if (relevantRenames.length > 0) {
            return {
              significanceAnalysis: {
                isSignificant: true,
                reason: 'File renames detected',
                confidence: 'high' as const,
                summary: `${relevantRenames.length} tracked file(s) were renamed`,
              },
              changesDetected: true,
            };
          }
          return { significanceAnalysis: null, changesDetected: true };
        }
      } catch (e) {
        console.error('Error performing significance analysis:', e);
      }
      return { significanceAnalysis: null, changesDetected: false };
    })();

    const effectivePromptConfig = promptConfig || repoSettings.llm_prompt_config || null;
    const effectiveModel = model || repoSettings.model;

    if (!effectiveModel) {
      return NextResponse.json({ error: 'model is required. Please select a model.' }, { status: 400 });
    }

    const system = buildSystemPrompt(effectivePromptConfig, true);

    // Build user prompt - indicate which files have summaries vs full content
    const userPrompt = `Project: ${documentTitle}\n\n` +
      `The following files are being tracked (${docsContent.filter(d => d.hasSummary).length} with summaries, ${docsContent.filter(d => !d.hasSummary).length} with full content):\n\n` +
      docsContent.map(f => `--- FILE: ${f.path} ${f.hasSummary ? '(summary)' : '(full content)'} ---\n${f.content}`).join('\n\n') +
      `\n\nPlease generate comprehensive documentation based on these files.`;

    const timestamp5 = new Date().toISOString();
    console.log(`[${timestamp5}] [generate-preview] Calling LLM with ${docsContent.length} files...`);
    const llmStart = Date.now();

    // Run LLM call and significance analysis in parallel
    const [markdown, sigResult] = await Promise.all([
      callGateway(
        [{ role: 'system', content: system }, { role: 'user', content: userPrompt }],
        effectiveModel,
        effectivePromptConfig?.temperature
      ).then(r => r.trim()),
      significancePromise,
    ]);

    significanceAnalysis = sigResult.significanceAnalysis;
    changesDetected = sigResult.changesDetected;

    const timestamp6 = new Date().toISOString();
    console.log(`[${timestamp6}] [generate-preview] LLM completed in ${Date.now() - llmStart}ms`);
    console.log(`[${timestamp6}] [generate-preview] Total time: ${Date.now() - startTime}ms`);

    return NextResponse.json({
      markdown,
      model: effectiveModel,
      promptConfig: effectivePromptConfig,
      significanceAnalysis: significanceAnalysis ? {
        isSignificant: significanceAnalysis.isSignificant,
        reason: significanceAnalysis.reason,
        confidence: significanceAnalysis.confidence,
        summary: significanceAnalysis.summary,
        technicalChanges: significanceAnalysis.technicalChanges,
        businessLogicChanges: significanceAnalysis.businessLogicChanges,
        unavailableFiles: significanceAnalysis.unavailableFiles,
      } : null,
      changesDetected,
    });
  } catch (err: any) {
    console.error('Error in /api/docs/generate-preview', err);
    return NextResponse.json({ error: 'Preview generation failed', detail: err.message || String(err) }, { status: 500 });
  }
}

