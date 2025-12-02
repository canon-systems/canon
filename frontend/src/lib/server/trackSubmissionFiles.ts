// ============================================================================
// trackSubmissionFiles.ts
//
// PURPOSE:
//   This helper takes a document and ensures files are tracked in document_files.
//   In the new schema, files are tracked when documents are created, but this
//   function exists for backward compatibility and migration purposes.
//
//   NOTE: In the new schema, document_files only stores document_id and file_path.
//   File hashes, sizes, and types are stored in repo_file_summaries.
//
//   This function is mainly for backward compatibility with old submission-based code.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { getUserOctokit } from './github/getUserOctokit';
import { parseRepoUrl } from './github/github';

// -----------------------------------------------------------------------------
// TYPE: DocumentRow (for backward compatibility, accepts submission-like structure)
// -----------------------------------------------------------------------------
type DocumentRow = {
  id: string;
  input_type?: string | null;
  selected_files?: string[] | null;
  source_meta?: any;
  code_snapshot?: {
    commitSha?: string;
    fileShas?: Record<string, string | null>;
    createdAt?: string;
  } | null;
};

// -----------------------------------------------------------------------------
// HELPER: Normalize repo URL to repo_id format
// -----------------------------------------------------------------------------
function normalizeRepoId(repoUrl: string): string {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) {
    throw new Error(`Invalid repo URL: ${repoUrl}`);
  }
  return `github.com/${parsed.owner}/${parsed.repo}`;
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
// NOTE: This function is kept for backward compatibility but in the new schema,
// files are tracked in document_files when documents are created.
// -----------------------------------------------------------------------------
export async function trackSubmissionFiles(params: {
  supabase: SupabaseClient;
  submission: DocumentRow;
  userId?: string | null;
}) {
  const { supabase, submission, userId } = params;

  // Check if this is a document (new schema) or submission (old schema)
  const { data: document } = await supabase
    .from('documents')
    .select('id, repo_id')
    .eq('id', submission.id)
    .single();

  if (document) {
    // New schema: files should already be in document_files
    // Just verify they exist
    const selectedFiles = submission.selected_files || [];
    
    if (selectedFiles.length === 0) {
      console.log(
        `trackSubmissionFiles: document ${submission.id} has no selected_files, nothing to track`
      );
      return;
    }

    // Get existing files
    const { data: existingFiles } = await supabase
      .from('document_files')
      .select('file_path')
      .eq('document_id', submission.id);

    const existingPaths = new Set((existingFiles || []).map(f => f.file_path));
    const filesToAdd = selectedFiles.filter(f => !existingPaths.has(f));

    if (filesToAdd.length > 0) {
      const fileMappings = filesToAdd.map(filePath => ({
        document_id: submission.id,
        file_path: filePath
      }));

      await supabase
        .from('document_files')
        .insert(fileMappings);
      
      console.log(
        `trackSubmissionFiles: Added ${filesToAdd.length} files to document_files for document ${submission.id}`
      );
    } else {
      console.log(
        `trackSubmissionFiles: All files already tracked in document_files for document ${submission.id}`
      );
    }
    return;
  }

  // Old schema fallback (for backward compatibility during migration)
  console.warn(
    `trackSubmissionFiles: submission ${submission.id} not found in documents table - this may be legacy data`
  );
  
  // In the new schema, we don't track file metadata in document_files
  // File hashes are stored in repo_file_summaries when summaries are generated
  // This function is mainly for backward compatibility
}

