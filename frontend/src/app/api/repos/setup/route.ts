import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { setupRepositorySimple } from '@/lib/server/services/repoSetupSimple';
import { parseRepoUrl } from '@/lib/server/github/github';

function normalizeRepoId(repoUrl: string): string {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) {
    throw new Error(`Invalid repo URL: ${repoUrl}`);
  }
  return `github.com/${parsed.owner}/${parsed.repo}`;
}

export async function POST(request: NextRequest) {
  try {
    const { repoId } = await request.json();

    if (!repoId) {
      return NextResponse.json(
        { error: 'repoId is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify user has access to this repository
    const { data: repo, error: repoError } = await supabase
      .from('workspace_repos')
      .select('id, workspace_id, default_branch, repo_url')
      .eq('id', repoId)
      .single();

    if (repoError || !repo) {
      return NextResponse.json(
        { error: 'Repository not found' },
        { status: 404 }
      );
    }

    const repoUrl = repo.repo_url;
    console.log(`[repo-setup] Using repo URL from database: ${repoUrl}`);

    // Check if setup already exists
    const { data: existingSetup, error: existingSetupError } = await supabase
      .from('repository_setup')
      .select('*')
      .eq('repo_id', repoId)
      .single();

    console.log(`[repo-setup] Existing setup check for repo ${repoId}:`, {
      exists: !!existingSetup,
      error: existingSetupError?.message,
      status: existingSetup?.setup_status
    });

    // If setup exists and is ready, don't allow re-setup
    if (existingSetup && !existingSetupError && existingSetup.setup_status === 'ready') {
      console.log(`[repo-setup] Repository ${repoId} is already set up`);
      return NextResponse.json(
        { error: 'Repository is already set up' },
        { status: 400 }
      );
    }

    // If setup is currently analyzing, allow restart (this will reset the state)
    if (existingSetup && !existingSetupError && existingSetup.setup_status === 'analyzing') {
      console.log(`[repo-setup] Repository ${repoId} is already analyzing, will reset and restart`);
    }

    // Generate a unique job ID for this setup session
    const jobId = `setup-${repoId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    let setup;

    if (existingSetup && !existingSetupError) {
      // Update existing setup record - reset to analyzing state
      console.log(`[repo-setup] Resetting existing setup record for repo ${repoId} (was: ${existingSetup.setup_status})`);
      const { data: updatedSetup, error: updateError } = await supabase
        .from('repository_setup')
        .update({
          setup_status: 'analyzing',
          setup_started_at: new Date().toISOString(),
          error_message: null, // Clear any previous errors
          total_files: 0,
          summarized_files: 0,
          current_file: null,
          processing_status: 'starting',
          progress_percentage: 0,
          processing_rate: null,
          estimated_time_remaining: null,
          recent_files: null,
          last_progress_update: new Date().toISOString(),
          setup_completed_at: null,
        })
        .eq('repo_id', repoId)
        .select()
        .single();

      if (updateError) {
        console.error('Failed to reset setup record:', updateError);
        return NextResponse.json(
          { error: 'Failed to reset existing setup' },
          { status: 500 }
        );
      }

      setup = updatedSetup;
      console.log(`[repo-setup] Successfully reset setup record: ${setup.id}`);
    } else {
      // Create new setup record
      console.log(`[repo-setup] Creating new setup record for repo ${repoId}`);
      const { data: newSetup, error: createError } = await supabase
        .from('repository_setup')
        .insert({
          repo_id: repoId,
          branch: repo.default_branch || 'main',
          setup_status: 'analyzing',
          setup_started_at: new Date().toISOString(),
          total_files: 0,
          summarized_files: 0,
          current_file: null,
          processing_status: 'starting',
          progress_percentage: 0,
          processing_rate: null,
          estimated_time_remaining: null,
          recent_files: null,
          last_progress_update: new Date().toISOString(),
        })
        .select()
        .single();

      if (createError) {
        console.error('Failed to create setup record:', createError);
        return NextResponse.json(
          { error: 'Failed to initialize setup' },
          { status: 500 }
        );
      }

      setup = newSetup;
      console.log(`[repo-setup] Successfully created setup record: ${setup.id}`);
    }

    // Start repository setup in background (non-blocking)
    try {
      console.log(`[repo-setup] Starting background setup for repo ${repoId} with job ID: ${jobId}`);

      // Run setup in background (don't await - let it run async)
      setupRepositorySimple(
        supabase,
        setup.id,
        repoUrl,
        repo.default_branch || 'main',
        repo.workspace_id,
        'gpt-4o-mini'
      ).catch((error) => {
        console.error('[repo-setup] Background setup failed:', error);
        // Error handling is done inside setupRepositorySimple
      });

      console.log(`[repo-setup] Background setup started successfully for setup ${setup.id}`);

      return NextResponse.json({
        success: true,
        setup: {
          id: setup.id,
          status: 'analyzing',
          jobId
        }
      });

    } catch (startError) {
      console.error('[repo-setup] Failed to start repository setup:', startError);

      // Update setup status to failed
      await supabase
        .from('repository_setup')
        .update({
          setup_status: 'failed',
          error_message: startError instanceof Error ? startError.message : 'Failed to start repository setup',
        })
        .eq('id', setup.id);

      return NextResponse.json(
        { error: 'Failed to start repository setup', details: startError instanceof Error ? startError.message : 'Unknown error' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Repository setup failed:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Cancel a running repository setup
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const repoId = searchParams.get('repoId');

    if (!repoId) {
      return NextResponse.json(
        { error: 'repoId parameter is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get the current setup status
    const { data: setup, error: setupError } = await supabase
      .from('repository_setup')
      .select('*')
      .eq('repo_id', repoId)
      .single();

    if (setupError || !setup) {
      return NextResponse.json(
        { error: 'Setup not found' },
        { status: 404 }
      );
    }

    if (setup.setup_status === 'ready') {
      return NextResponse.json(
        { error: 'Setup is already complete' },
        { status: 400 }
      );
    }

    // Update status to cancelled
    await supabase
      .from('repository_setup')
      .update({
        setup_status: 'failed',
        error_message: 'Setup cancelled by user',
        setup_completed_at: new Date().toISOString(),
      })
      .eq('id', setup.id);

    console.log(`[repo-setup] Cancelled setup for repo ${repoId}`);

    return NextResponse.json({
      success: true,
      message: 'Setup cancelled successfully'
    });

  } catch (error) {
    console.error('Failed to cancel repository setup:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const repoId = searchParams.get('repoId');

    if (!repoId) {
      return NextResponse.json(
        { error: 'repoId parameter is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get repository info to normalize repo_id for querying repo_file_summaries
    const { data: repo, error: repoError } = await supabase
      .from('workspace_repos')
      .select('repo_url')
      .eq('id', repoId)
      .single();

    if (repoError) {
      console.error('Failed to get repository:', repoError);
      return NextResponse.json(
        { error: 'Repository not found' },
        { status: 404 }
      );
    }

    // Get repository setup status
    const { data: setup, error: setupError } = await supabase
      .from('repository_setup')
      .select('*')
      .eq('repo_id', repoId)
      .single();

    if (setupError && setupError.code !== 'PGRST116') { // PGRST116 is "not found"
      console.error('Failed to get setup status:', setupError);
      return NextResponse.json(
        { error: 'Failed to get setup status' },
        { status: 500 }
      );
    }

    if (!setup) {
      return NextResponse.json({
        setup: null,
        status: 'not_started'
      });
    }

    // Get actual count from repo_file_summaries for accuracy
    let actualSummarizedFiles = setup.summarized_files || 0;
    if (repo?.repo_url) {
      try {
        const normalizedRepoId = normalizeRepoId(repo.repo_url);
        const branch = setup.branch || 'main';

        const { count, error: countError } = await supabase
          .from('repo_file_summaries')
          .select('*', { count: 'exact', head: true })
          .ilike('repo_id', normalizedRepoId)
          .eq('branch', branch);

        if (!countError && count !== null) {
          actualSummarizedFiles = count;
        } else if (countError) {
          console.warn('Failed to get actual count from repo_file_summaries:', countError);
          // Fall back to cached value if query fails
        }
      } catch (error) {
        console.warn('Failed to normalize repo URL or query summaries:', error);
        // Fall back to cached value if normalization fails
      }
    }

    // Get file-doc relationships (using document_files table)
    // First get all documents for this repo
    const { data: repoDocuments, error: docsError } = await supabase
      .from('documents')
      .select('id')
      .eq('repo_id', repoId);

    const docIds = repoDocuments?.map(d => d.id) || [];

    let relationships: Array<{ file_path: string; relationship_type: string; doc_id: string }> = [];

    if (docIds.length > 0) {
      const { data: documentFiles, error: relError } = await supabase
        .from('document_files')
        .select('file_path, document_id')
        .in('document_id', docIds);

      if (relError) {
        console.error('Failed to get relationships:', relError);
      } else {
        // Transform to match expected format
        relationships = (documentFiles || []).map(df => ({
          file_path: df.file_path,
          relationship_type: 'primary', // All files in document_files are primary
          doc_id: df.document_id,
        }));
      }
    }

    return NextResponse.json({
      setup: {
        id: setup.id,
        status: setup.setup_status,
        totalFiles: setup.total_files,
        summarizedFiles: actualSummarizedFiles, // Use actual count from repo_file_summaries
        progress: setup.progress_percentage || 0,
        startedAt: setup.setup_started_at,
        completedAt: setup.setup_completed_at,
        errorMessage: setup.error_message,
        currentFile: setup.current_file,
        processingStatus: setup.processing_status,
        lastProgressUpdate: setup.last_progress_update,
        processingRate: setup.processing_rate,
        estimatedTimeRemaining: setup.estimated_time_remaining,
        recentFiles: setup.recent_files ? JSON.parse(setup.recent_files) : [],
      },
      relationships: relationships || [],
    });

  } catch (error) {
    console.error('Failed to get repository setup:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
