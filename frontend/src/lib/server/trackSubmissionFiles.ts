// ============================================================================
// trackSubmissionFiles.ts
//
// PURPOSE:
//   This helper takes a submission row that *already* has a code_snapshot
//   (commit SHA + blob SHAs for each file) and stores metadata for each
//   selected file in the submission_files table.
//
//   Metadata includes:
//     • file_path  (where the file lives in the repo)
//     • file_hash  (blob SHA of the file at that commit)
//     • size_bytes (how big the file actually is)
//     • file_type  (simple extension like ts, py, json, etc)
//
//   WHY THIS EXISTS:
//     Because documentation updates depend on detecting *what* files were used
//     to generate the docs, and checking later if those files changed.
//
//   HOW IT WORKS:
//     1. Confirm submission came from GitHub
//     2. Extract repo owner + repo name
//     3. For each file:
//           Try #1: GitHub getContent() API to get size
//           Try #2: GitHub blob API fallback using the SHA
//     4. UPSERT into submission_files
//        (so re running this will not duplicate rows)
//
// NOTE:
//   This file is insanely commented on purpose per your instructions.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { getUserOctokit } from './github/getUserOctokit';

// -----------------------------------------------------------------------------
// TYPE: SubmissionRow
// -----------------------------------------------------------------------------
type SubmissionRow = {
  id: string;
  input_type: string | null;
  selected_files: string[] | null;
  source_meta: any;
  code_snapshot?: {
    commitSha?: string;
    fileShas?: Record<string, string | null>;
    createdAt?: string;
  } | null;
};

// -----------------------------------------------------------------------------
// HELPER: Parse GitHub Repo URL
// -----------------------------------------------------------------------------
function parseGitHubRepoUrl(repoUrl: string): { owner: string; repo: string } {
  const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\.git|$|\/)/);

  if (!match) {
    throw new Error(`Could not parse GitHub repo URL: ${repoUrl}`);
  }

  const owner = match[1];
  const repo = match[2].replace(/\.git$/, '');

  return { owner, repo };
}

// -----------------------------------------------------------------------------
// HELPER: Infer file type from file path
// -----------------------------------------------------------------------------
function guessFileTypeFromPath(path: string): string {
  const lastDot = path.lastIndexOf('.');

  if (lastDot === -1) return 'unknown';

  const ext = path.slice(lastDot + 1).toLowerCase();

  return ext || 'unknown';
}

// -----------------------------------------------------------------------------
// MAIN FUNCTION: trackSubmissionFiles
// -----------------------------------------------------------------------------
export async function trackSubmissionFiles(params: {
  supabase: SupabaseClient;
  submission: SubmissionRow;
  userId?: string | null;
}) {
  const { supabase, submission, userId } = params;

  const octokit = await getUserOctokit(supabase, userId || null);

  const isGitSubmission =
    submission.input_type === 'github_repo' ||
    submission.input_type === 'github_repo_directory';

  if (!isGitSubmission) {
    console.log(
      `trackSubmissionFiles: skipping submission ${submission.id} because input_type is not a Git type`
    );
    return;
  }

  const snapshot = submission.code_snapshot || null;
  const commitSha = snapshot?.commitSha || null;
  const fileShas = snapshot?.fileShas || {};

  if (!snapshot) {
    console.warn(
      `trackSubmissionFiles: submission ${submission.id} has no code_snapshot, will use selected_files only`
    );
  }

  const meta = submission.source_meta || {};
  const repoUrl: string | undefined = meta.repoUrl;

  if (!repoUrl) {
    console.warn(
      `trackSubmissionFiles: submission ${submission.id} missing repoUrl. Cannot query GitHub.`
    );
    return;
  }

  let owner: string;
  let repo: string;
  let branch: string;

  try {
    const parsed = parseGitHubRepoUrl(repoUrl);
    owner = parsed.owner;
    repo = parsed.repo;
    branch = meta.branch || 'main';
  } catch (e) {
    console.error(
      `trackSubmissionFiles: failed to parse repoUrl for submission ${submission.id}`,
      e
    );
    return;
  }

  const refToUse = commitSha || branch;

  const selectedFiles = submission.selected_files || [];

  if (selectedFiles.length === 0) {
    console.warn(
      `trackSubmissionFiles: submission ${submission.id} has no selected_files, nothing to track`
    );
    return;
  }

  const rowsToUpsert: {
    submission_id: string;
    file_path: string;
    file_hash: string | null;
    size_bytes: number | null;
    file_type: string | null;
  }[] = [];

  for (const file_path of selectedFiles) {
    const file_hash = fileShas[file_path] ?? null;

    if (!file_hash) {
      console.warn(
        `trackSubmissionFiles: no file_hash for ${file_path} (submission ${submission.id}), will try to get size via path only`
      );
    }

    let size_bytes: number | null = null;
    let file_type: string | null = null;

    try {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path: file_path,
        ref: refToUse
      });

      if (!Array.isArray(data) && data.type === 'file') {
        if (typeof data.size === 'number' && data.size >= 0) {
          size_bytes = data.size;
        }
        file_type = guessFileTypeFromPath(file_path);
      } else {
        file_type = guessFileTypeFromPath(file_path);
      }
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      const errorStatus = e?.status || e?.response?.status;
      console.warn(
        `trackSubmissionFiles: getContent FAILED for ${file_path} in submission ${submission.id}`,
        { error: errorMsg, status: errorStatus }
      );

      file_type = guessFileTypeFromPath(file_path);
    }

    if (size_bytes === null && file_hash) {
      try {
        const { data: blobData } = await octokit.git.getBlob({
          owner,
          repo,
          file_sha: file_hash
        });

        if (blobData && typeof blobData.size === 'number' && blobData.size >= 0) {
          size_bytes = blobData.size;
          console.log(
            `trackSubmissionFiles: got size ${size_bytes} bytes for ${file_path} via blob API`
          );
        } else {
          console.warn(
            `trackSubmissionFiles: blob API returned invalid size for ${file_path}`,
            { size: blobData?.size, type: typeof blobData?.size }
          );
        }
      } catch (e: any) {
        const errorMsg = e?.message || String(e);
        const errorStatus = e?.status || e?.response?.status;
        console.warn(
          `trackSubmissionFiles: blob fallback FAILED for ${file_path} in submission ${submission.id}`,
          { error: errorMsg, status: errorStatus, file_hash }
        );
      }
    }

    if (size_bytes === null) {
      console.warn(
        `trackSubmissionFiles: WARNING - could not determine size for ${file_path} in submission ${submission.id}. Both getContent and blob API failed or returned no size.`
      );
    }

    rowsToUpsert.push({
      submission_id: submission.id,
      file_path,
      file_hash,
      size_bytes,
      file_type
    });
  }

  if (rowsToUpsert.length === 0) {
    console.warn(
      `trackSubmissionFiles: no rows to insert for submission ${submission.id} (selected_files was empty or all files were skipped)`
    );
    return;
  }

  const { error: insertError } = await supabase
    .from('submission_files')
    .insert(rowsToUpsert, {
      onConflict: 'submission_id,file_path',
      ignoreDuplicates: true
    } as any);

  if (insertError) {
    console.error(
      `trackSubmissionFiles: INSERT FAILED for submission ${submission.id}`,
      insertError
    );
    throw insertError;
  }

  console.log(
    `trackSubmissionFiles: Successfully inserted ${rowsToUpsert.length} rows for submission ${submission.id}`
  );
}

