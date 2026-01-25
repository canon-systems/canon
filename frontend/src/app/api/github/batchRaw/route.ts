import { NextRequest, NextResponse } from 'next/server';
import { getUserOctokit } from '@/lib/server/github/getUserOctokit';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';

// This turns base64 strings (what GitHub Contents API gives us for file bodies)
// back into normal readable text.
function base64ToString(b64: string): string {
  try {
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return String(b64);
  }
}

// Sometimes different OS/newlines are used. This function makes newlines consistent.
function normalizeNewlines(s: string): string {
  return s.replace(/\r\n/g, '\n');
}

// When we only want a small preview, we carefully slice the first N characters.
function safePreview(s: string, maxChars: number): string {
  return s.slice(0, Math.max(0, maxChars | 0));
}

// Build the "raw" URL that serves the plain file text directly (no JSON wrapper).
function rawUrl(owner: string, repo: string, branch: string, repoPath: string): string {
  const cleanPath = repoPath.replace(/^\/+/, '');
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${cleanPath}`;
}

// CORE FETCH: ONE FILE, TWO STRATEGIES
async function fetchOneFile(
  octokit: Awaited<ReturnType<typeof getUserOctokit>>,
  owner: string,
  repo: string,
  branch: string,
  repoPath: string,
  previewChars: number,
  includeContent: boolean,
  maxBytes: number
) {
  const result = {
    path: repoPath,
    size: 0,
    preview: '',
    content: undefined as string | undefined
  };

  // Try #1: Contents API (JSON with base64 "content")
  try {
    const { data: j } = await octokit.repos.getContent({
      owner,
      repo,
      path: repoPath,
      ref: branch
    });

    if (j && !Array.isArray(j) && j.type === 'file' && typeof j.content === 'string') {
      const text = normalizeNewlines(base64ToString(j.content));
      result.size = text.length;
      result.preview = safePreview(text, previewChars);

      if (includeContent && text.length <= maxBytes) {
        result.content = text;
      }
      return result;
    }
  } catch {
    // If the Contents API call failed, try raw next.
  }

  // Try #2: Raw URL (plain text from GitHub)
  try {
    const raw = rawUrl(owner, repo, branch, repoPath);
    const r2 = await fetch(raw, { headers: { accept: 'text/plain' } });

    if (r2.ok) {
      const text = normalizeNewlines(await r2.text());
      result.size = text.length;
      result.preview = safePreview(text, previewChars);

      if (includeContent && text.length <= maxBytes) {
        result.content = text;
      }
      return result;
    }
  } catch {
    // If even the raw fetch failed, return default
  }

  return result;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));

    const repoUrl = String(body.repoUrl || '');
    const branch = String(body.branch || 'main');
    const subdirRaw = String(body.subdir || '');
    const selectedFiles = body.selectedFiles ?? [];
    const includeContent = Boolean(body.includeContent);
    const previewChars = Number(body.previewChars ?? 800);
    const maxBytes = Number(body.maxBytes ?? 200_000);

    if (!repoUrl.includes('github.com')) {
      return NextResponse.json({ error: 'repoUrl must be a GitHub URL' }, { status: 400 });
    }

    const noProto = repoUrl.replace(/^https?:\/\//, '');
    const parts = noProto.split('/').filter(Boolean);
    const owner = parts[1];
    const repo = parts[2];
    if (!owner || !repo) {
      return NextResponse.json({ error: 'repoUrl is missing owner or repo' }, { status: 400 });
    }

    const subdir = subdirRaw.replace(/^\/+|\/+$/g, '');

    const { user } = await getSession();
    const supabase = await createClient();
    const octokit = await getUserOctokit(supabase, user?.id || null, owner, repo);

    const files: string[] = Array.isArray(selectedFiles)
      ? selectedFiles.map(String)
      : typeof selectedFiles === 'string'
        ? [selectedFiles]
        : [];

    const repoRelative = files.map((name) => {
      const clean = String(name).replace(/^\/+/, '');
      if (subdir && !clean.startsWith(subdir + '/')) return `${subdir}/${clean}`;
      return clean;
    });

    const results = await Promise.all(
      repoRelative.map((path) =>
        fetchOneFile(octokit, owner, repo, branch, path, previewChars, includeContent, maxBytes)
      )
    );

    return NextResponse.json({ files: results }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: 'Server crashed while reading files', detail: String(err) },
      { status: 500 }
    );
  }
}
