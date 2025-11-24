import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { getUserOctokit } from '@/lib/server/github/getUserOctokit';
import { buildSystemPrompt } from '@/lib/server/prompts/buildSystemPrompt';

const VERCEL_AI_GATEWAY_URL = process.env.VERCEL_AI_GATEWAY_URL;
const VERCEL_AI_GATEWAY_API_KEY = process.env.VERCEL_AI_GATEWAY_API_KEY;

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

function parseRepoUrl(repoUrl: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(repoUrl);
    if (u.hostname !== 'github.com' && !u.hostname.includes('github.com')) {
      return null;
    }
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { submissionId, model, promptConfig } = body as {
      submissionId: string;
      model: string;
      promptConfig?: any;
    };

    if (!submissionId) {
      return NextResponse.json({ error: 'submissionId is required' }, { status: 400 });
    }

    if (!model) {
      return NextResponse.json({ error: 'model is required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { user } = await getSession();

    const { data: submission, error: subError } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', submissionId)
      .single();

    if (subError || !submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    const sourceMeta = submission.source_meta || {};
    const inputType = submission.input_type;

    if (inputType !== 'github_repo' && inputType !== 'github_repo_directory') {
      return NextResponse.json({ error: 'Preview generation only supported for repository-based submissions' }, { status: 400 });
    }

    const { repoUrl, branch } = sourceMeta;
    if (!repoUrl || !branch) {
      return NextResponse.json({ error: 'Missing repoUrl or branch in source_meta' }, { status: 400 });
    }

    const repoInfo = parseRepoUrl(repoUrl);
    if (!repoInfo) {
      return NextResponse.json({ error: `Failed to parse repository URL: ${repoUrl}` }, { status: 400 });
    }

    const selectedFiles = submission.selected_files || [];
    if (selectedFiles.length === 0) {
      return NextResponse.json({ error: 'No files selected for this submission' }, { status: 400 });
    }

    // Fetch latest file contents
    const octokit = await getUserOctokit(supabase, user?.id || null);
    const filesForDoc: Array<{ path: string; content: string }> = [];
    const MAX_PER_FILE = 200_000;

    for (const filePath of selectedFiles) {
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
          filesForDoc.push({ path: filePath, content: clipped });
        }
      } catch (e) {
        console.error(`Failed to fetch ${filePath}:`, e);
      }
    }

    if (filesForDoc.length === 0) {
      return NextResponse.json({ error: 'Could not fetch any file contents' }, { status: 500 });
    }

    const effectivePromptConfig = promptConfig || sourceMeta.llm_prompt_config || null;
    const effectiveModel = model || sourceMeta.model;
    
    if (!effectiveModel) {
      return NextResponse.json({ error: 'model is required. Please select a model.' }, { status: 400 });
    }

    const system = buildSystemPrompt(effectivePromptConfig, true);
    const userPrompt = `Project: ${submission.title || 'Documentation'}\n\n` +
      `The following files have been updated:\n` +
      filesForDoc.map(f => `--- FILE: ${f.path} ---\n${f.content}`).join('\n\n') +
      `\n\nPlease update the documentation to reflect these changes.`;

    const markdown = (await callGateway(
      [{ role: 'system', content: system }, { role: 'user', content: userPrompt }],
      effectiveModel,
      effectivePromptConfig?.temperature
    )).trim();

    return NextResponse.json({
      markdown,
      model: effectiveModel,
      promptConfig: effectivePromptConfig
    });
  } catch (err: any) {
    console.error('Error in /api/docs/generate-preview', err);
    return NextResponse.json({ error: 'Preview generation failed', detail: err.message || String(err) }, { status: 500 });
  }
}

