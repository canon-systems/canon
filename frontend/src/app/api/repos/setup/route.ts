import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { setupRepositorySimple, cancelSetupImmediately } from '@/lib/server/services/repoSetupSimple';
import { setupJiraSourceSimple } from '@/lib/server/services/jiraSetupSimple';
import { parseRepoUrl } from '@/lib/server/github/github';

export const runtime = 'nodejs';

function normalizeRepoId(repoUrl: string): string {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) {
    throw new Error(`Invalid repo URL: ${repoUrl}`);
  }
  return `github.com/${parsed.owner}/${parsed.repo}`;
}

export async function POST(request: NextRequest) {
  const { repoId, sourceId } = await request.json();
  const effectiveId = sourceId || repoId;
  const { user, session } = await getSession();
  if (!user || !session?.access_token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = await createClient();

  try {

    if (!effectiveId) {
      return NextResponse.json(
        { error: 'sourceId (or repoId) is required' },
        { status: 400 }
      );
    }

    // Verify user has access to this source
    const { data: source, error: repoError } = await supabase
      .from('workspace_sources')
      .select('id, user_id, default_branch, repo_url, provider, settings, external_url, source_type')
      .eq('id', effectiveId)
      .single();

    if (repoError || !source) {
      return NextResponse.json(
        { error: 'Source not found' },
        { status: 404 }
      );
    }

    const repoUrl = source.repo_url || source.external_url || '';
    console.log(`[source-setup] Using URL from database: ${repoUrl}`);

    // Check if setup already exists
    const { data: existingSetupList, error: existingSetupError } = await supabase
      .from('source_setup')
      .select('*')
      .eq('source_id', effectiveId)
      .order('created_at', { ascending: false })
      .limit(1);
    const existingSetup = existingSetupList?.[0] ?? null;

    console.log(`[source-setup] Existing setup check for source ${effectiveId}:`, {
      exists: !!existingSetup,
      error: existingSetupError?.message,
      status: existingSetup?.setup_status
    });

    // If setup exists and is ready, don't allow re-setup
    if (existingSetup && !existingSetupError && existingSetup.setup_status === 'ready') {
      console.log(`[source-setup] Source ${effectiveId} is already set up`);
      return NextResponse.json(
        { error: 'Source is already set up' },
        { status: 400 }
      );
    }

    // If setup is currently analyzing, allow restart (this will reset the state)
    if (existingSetup && !existingSetupError && existingSetup.setup_status === 'analyzing') {
      console.log(`[source-setup] Source ${effectiveId} is already analyzing, will reset and restart`);
    }

    // Generate a unique job ID for this setup session
    const jobId = `setup-${effectiveId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    let setup;

    if (existingSetup && !existingSetupError) {
      // Update existing setup record - reset to analyzing state
      console.log(`[source-setup] Resetting existing setup record for source ${effectiveId} (was: ${existingSetup.setup_status})`);
      const { data: updatedSetup, error: updateError } = await supabase
        .from('source_setup')
        .update({
          setup_status: 'analyzing',
          setup_started_at: new Date().toISOString(),
          error_message: null, // Clear any previous errors
          total_files: 0,
          summarized_files: 0,
          current_item: null,
          processing_status: 'starting',
          progress_percentage: 0,
          processing_rate: null,
          estimated_time_remaining: null,
          recent_items: null,
          last_progress_update: new Date().toISOString(),
          setup_completed_at: null,
        })
        .eq('source_id', effectiveId)
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
      console.log(`[source-setup] Creating new setup record for source ${effectiveId}`);
      const { data: newSetup, error: createError } = await supabase
        .from('source_setup')
        .insert({
          source_id: effectiveId,
          source_provider: source.provider,
          source_scope: source.settings || {},
          branch: source.provider === 'jira' ? 'jira' : (source.default_branch || 'main'),
          setup_status: 'analyzing',
          setup_started_at: new Date().toISOString(),
          total_files: 0,
          summarized_files: 0,
          current_item: null,
          processing_status: 'starting',
          progress_percentage: 0,
          processing_rate: null,
          estimated_time_remaining: null,
          recent_items: null,
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
      console.log(`[source-setup] Starting background setup for source ${effectiveId} with job ID: ${jobId}`);

      // Run setup in background (don't await - let it run async)
      if (source.provider === 'jira') {
        const settings = source.settings && typeof source.settings === 'object'
          ? (source.settings as Record<string, unknown>)
          : {};
        const projectKey = typeof settings.jira_project_key === 'string' ? settings.jira_project_key : null;
        const cloudId = typeof settings.cloud_id === 'string' ? settings.cloud_id : null;

        setupJiraSourceSimple(
          supabase,
          setup.id,
          {
            repoId: source.id, // Jira setup uses numeric repoId but maps to source_id
            userId: source.user_id,
            projectKey,
            cloudId,
          }
        ).catch((error) => {
          console.error('[repo-setup] Jira setup failed:', error);
        });
      } else {
        setupRepositorySimple(
          supabase,
          setup.id,
          repoUrl,
          source.default_branch || 'main',
          source.user_id,
          'openai/gpt-4o-mini'
        ).catch((error) => {
          console.error('[repo-setup] Background setup failed:', error);
          // Error handling is done inside setupRepositorySimple
        });
      }

      console.log(`[source-setup] Background setup started successfully for setup ${setup.id}`);

      return NextResponse.json({
        success: true,
        setup: {
          id: setup.id,
          status: 'analyzing',
          jobId
        }
      });

    } catch (startError) {
      console.error('[source-setup] Failed to start setup:', startError);

      // Update setup status to failed
      await supabase
        .from('source_setup')
        .update({
          setup_status: 'failed',
          error_message: startError instanceof Error ? startError.message : 'Failed to start source setup',
        })
        .eq('id', setup.id);

      // Remove the source from workspace_sources since setup failed to start
      console.log(`[source-setup] Removing source ${effectiveId} from workspace_sources due to setup failure`);
      await supabase
        .from('workspace_sources')
        .delete()
        .eq('id', effectiveId);

      return NextResponse.json(
        { error: 'Failed to start repository setup', details: startError instanceof Error ? startError.message : 'Unknown error' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Source setup failed:', error);

    // If we have an id, remove the source from workspace_sources since setup failed
    if (effectiveId) {
      console.log(`[source-setup] Removing source ${effectiveId} from workspace_sources due to unexpected error`);
      try {
        await supabase
          .from('workspace_sources')
          .delete()
          .eq('id', effectiveId);
      } catch (deleteError) {
        console.error('Failed to remove repository after setup error:', deleteError);
      }
    }

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
    const sourceId = searchParams.get('sourceId');
    const effectiveId = sourceId || repoId;

    if (!effectiveId) {
      return NextResponse.json(
        { error: 'sourceId (or repoId) parameter is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get the current setup status
    const { data: setup, error: setupError } = await supabase
      .from('source_setup')
      .select('*')
      .eq('source_id', effectiveId)
      .single();

    // Removed unused variable: setupId
    if (setup && !setupError) {

      if (setup.setup_status === 'ready') {
        return NextResponse.json(
          { error: 'Setup is already complete' },
          { status: 400 }
        );
      }

      // Immediately cancel the running setup process
      const immediateCancel = cancelSetupImmediately(setup.id);
      if (immediateCancel) {
        console.log(`[repo-setup] Immediately cancelled running setup process for ${setup.id}`);
      } else {
        console.log(`[repo-setup] No active setup process found for ${setup.id} (might have already completed)`);
      }

      // Update status to cancelled
      await supabase
        .from('source_setup')
        .update({
          setup_status: 'failed',
          error_message: 'Setup cancelled by user',
          setup_completed_at: new Date().toISOString(),
        })
        .eq('id', setup.id);

      console.log(`[repo-setup] Updated setup record ${setup.id} to cancelled status`);
    } else {
      console.log(`[source-setup] No setup record found for source ${effectiveId} - cancelling without database record`);
    }

    // Remove the source from workspace_sources since setup was cancelled
    console.log(`[source-setup] Removing cancelled source ${effectiveId} from workspace_sources`);
    await supabase
      .from('workspace_sources')
      .delete()
      .eq('id', effectiveId);

    console.log(`[source-setup] Cancelled setup for source ${effectiveId} and removed source record`);

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
    const sourceId = searchParams.get('sourceId');
    const effectiveId = sourceId || repoId;

    if (!effectiveId) {
      return NextResponse.json(
        { error: 'sourceId (or repoId) parameter is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get repository info to normalize repo_id for querying repo_file_summaries
    const { data: repo, error: repoError } = await supabase
      .from('workspace_sources')
      .select('repo_url, external_url, provider, id')
      .eq('id', effectiveId)
      .single();

    // If repository doesn't exist (likely cancelled and removed), check if setup record exists
    if (repoError && repoError.code === 'PGRST116') {
      console.log(`Source ${effectiveId} not found in workspace_sources (likely cancelled and removed)`);

      // Check if there's still a setup record
      const { data: setupRecord } = await supabase
        .from('source_setup')
        .select('setup_status, error_message')
        .eq('source_id', effectiveId)
        .single();

      if (setupRecord) {
        // Setup record exists but repo was removed (cancelled)
        return NextResponse.json({
          setup: {
            id: null,
            status: 'cancelled',
            message: setupRecord.error_message || 'Setup was cancelled and repository removed'
          }
        });
      } else {
        // No setup record either
        return NextResponse.json(
          { error: 'Setup not found - source was removed' },
          { status: 404 }
        );
      }
    }

    if (repoError) {
      console.error('Failed to get repository:', repoError);
      return NextResponse.json(
        { error: 'Repository not found' },
        { status: 404 }
      );
    }

    // Get repository setup status
    const { data: setup, error: setupError } = await supabase
      .from('source_setup')
      .select('*')
      .eq('source_id', effectiveId)
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
    if (repo?.provider !== 'jira' && (repo?.repo_url || repo?.external_url)) {
      try {
        const normalizedRepoId = normalizeRepoId(repo.repo_url || repo.external_url || '');
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
    const { data: repoDocuments } = await supabase
      .from('documents')
      .select('id')
      .eq('source_id', effectiveId);

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
