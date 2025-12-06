import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getUserOctokit } from '@/lib/server/github/getUserOctokit';
import { getCachedBranch } from '@/lib/server/github/cachedOctokit';
import { parseRepoUrl } from '@/lib/server/github/github';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const supabase = await createClient();

    // Get the automation rule
    const { data: rule, error: ruleError } = await supabase
      .from('automation_rules')
      .select('*')
      .eq('repo_id', id)
      .eq('workspace_id', user.id)
      .single();

    if (ruleError || !rule) {
      console.error('Rule not found:', ruleError);
      return NextResponse.json({ error: 'Automation rule not found' }, { status: 404 });
    }

    // Get the repository
    const { data: repo, error: repoError } = await supabase
      .from('workspace_repos')
      .select('*')
      .eq('id', id)
      .single();

    if (repoError || !repo) {
      console.error('Repository not found:', repoError);
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
    }

    console.log(`Getting current commit SHA for repo: ${repo.repo_url}, branch: ${repo.default_branch}`);

    // Get the current commit SHA
    const octokit = await getUserOctokit(supabase, user.id);
    const parsed = parseRepoUrl(repo.repo_url);

    if (!parsed) {
      return NextResponse.json({ error: 'Invalid repository URL' }, { status: 400 });
    }

    const branchData = await getCachedBranch(octokit, parsed.owner, parsed.repo, repo.default_branch);
    const currentCommitSha = branchData.commit.sha;

    console.log(`Current commit SHA: ${currentCommitSha}`);

    // Update the automation rule with the current commit SHA
    const { error: updateError } = await supabase
      .from('automation_rules')
      .update({
        last_commit_sha: currentCommitSha,
        updated_at: new Date().toISOString()
      })
      .eq('rule_id', rule.rule_id);

    if (updateError) {
      console.error('Error updating rule:', updateError);
      return NextResponse.json({ error: 'Failed to update automation rule' }, { status: 500 });
    }

    console.log(`✅ Successfully updated automation rule ${rule.rule_id} with commit SHA: ${currentCommitSha}`);

    return NextResponse.json({
      success: true,
      message: `Updated automation rule with commit SHA: ${currentCommitSha}`,
      commit_sha: currentCommitSha
    });

  } catch (error: any) {
    console.error('Error populating commit SHA:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to populate commit SHA' },
      { status: 500 }
    );
  }
}
