import { NextRequest, NextResponse } from 'next/server';
import { getGitHubAppOctokit, getGitHubAppOctokitForApp } from '@/lib/server/github/appAuth';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

/**
 * API endpoint to list repositories for a GitHub user or organization
 * Uses GitHub App installation access
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { owner, search } = body as { owner?: string; search?: string };

    // Require authentication for this API (not GitHub OAuth)
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const supabase = await createClient();

    const normalizedOwner = owner?.toLowerCase();
    const shouldListInstallationRepos = !owner || (normalizedOwner && ['me', '@me', 'self', '@self'].includes(normalizedOwner));

    // If owner is omitted or set to @me/self, list all repos available to the user's installed GitHub App
    if (shouldListInstallationRepos) {
      const { data: connection } = await supabase
        .from('oauth_connections')
        .select('connection_id, metadata')
        .eq('user_id', user.id)
        .eq('provider', 'github')
        .eq('status', 'active')
        .maybeSingle();

      const installationId =
        (connection?.metadata && typeof connection.metadata === 'object' && 'installation_id' in connection.metadata)
          ? Number((connection.metadata as Record<string, unknown>).installation_id)
          : Number(connection?.connection_id);

      if (!installationId) {
        return NextResponse.json(
          {
            error: 'GitHub App not installed',
            detail: 'Install the GitHub App to select repositories.'
          },
          { status: 403 }
        );
      }

      const octokit = getGitHubAppOctokit(installationId);
      const { data: installRepos } = await octokit.apps.listReposAccessibleToInstallation({
        per_page: 100
      });
      const repoList = Array.isArray((installRepos as { repositories?: unknown[] }).repositories)
        ? (installRepos as { repositories: Array<{ id: number; name: string; full_name: string; html_url: string; description: string | null; private: boolean; default_branch: string; language: string | null; updated_at: string; owner?: { login?: string; id?: number; type?: string } }> }).repositories
        : (installRepos as { repositories?: Array<{ id: number; name: string; full_name: string; html_url: string; description: string | null; private: boolean; default_branch: string; language: string | null; updated_at: string; owner?: { login?: string; id?: number; type?: string } }> }).repositories || [];

      const repos = Array.isArray(repoList) ? repoList : [];

      return NextResponse.json({
        repos: repos.map((r) => ({
          id: r.id,
          name: r.name,
          full_name: r.full_name,
          installation_id: installationId,
          owner_id: r.owner?.id ?? null,
          organization_id: r.owner?.type === 'Organization' ? (r.owner?.id ?? null) : null,
          html_url: r.html_url,
          description: r.description,
          private: r.private,
          default_branch: r.default_branch,
          language: r.language,
          updated_at: r.updated_at
        }))
      });
    }

    const appOctokit = getGitHubAppOctokitForApp();

    // Determine if owner is a user or org
    let ownerType: 'User' | 'Organization';
    try {
      const { data: userOrOrg } = await appOctokit.users.getByUsername({ username: owner });
      if (userOrOrg.type !== 'User' && userOrOrg.type !== 'Organization') {
        return NextResponse.json(
          { error: `Unexpected owner type: ${userOrOrg.type}` },
          { status: 500 }
        );
      }
      ownerType = userOrOrg.type;
    } catch (error: unknown) {
      if (error instanceof Error && 'status' in error && (error as { status: number }).status === 404) {
        return NextResponse.json(
          { error: `User or organization '${owner}' not found` },
          { status: 404 }
        );
      }
      throw error;
    }

    let installationId: number;
    try {
      if (ownerType === 'Organization') {
        const { data } = await appOctokit.apps.getOrgInstallation({ org: owner });
        installationId = data.id;
      } else {
        const { data } = await appOctokit.apps.getUserInstallation({ username: owner });
        installationId = data.id;
      }
    } catch (error: unknown) {
      if (error instanceof Error && 'status' in error && (error as { status: number }).status === 404) {
        return NextResponse.json(
          {
            error: 'GitHub App not installed',
            detail: `Install the GitHub App for ${owner} to access repositories.`
          },
          { status: 403 }
        );
      }
      throw error;
    }

    const octokit = getGitHubAppOctokit(installationId);
    const repos: Array<{
      id: number;
      name: string;
      full_name: string;
      html_url: string;
      description: string | null;
      private: boolean;
      default_branch: string;
      language: string | null;
      updated_at: string;
      owner?: { login?: string; id?: number; type?: string };
    }> = [];

    try {
      const { data: installRepos } = await octokit.apps.listReposAccessibleToInstallation({
        per_page: 100
      });
      const repoList = Array.isArray((installRepos as { repositories?: unknown[] }).repositories)
        ? (installRepos as { repositories: Array<{ id: number; name: string; full_name: string; html_url: string; description: string | null; private: boolean; default_branch: string; language: string | null; updated_at: string; owner?: { login?: string; id?: number; type?: string } }> }).repositories
        : (installRepos as { repositories?: Array<{ id: number; name: string; full_name: string; html_url: string; description: string | null; private: boolean; default_branch: string; language: string | null; updated_at: string; owner?: { login?: string; id?: number; type?: string } }> }).repositories || [];
      if (Array.isArray(repoList)) {
        const ownerLower = owner.toLowerCase();
        repos.push(...repoList.filter((r) => r.owner?.login?.toLowerCase() === ownerLower));
      }
    } catch (error: unknown) {
      // If 404, owner doesn't exist or user doesn't have access
      if (error instanceof Error && 'status' in error && (error as { status: number }).status === 404) {
        return NextResponse.json(
          { error: `Owner '${owner}' not found or not accessible via GitHub App` },
          { status: 404 }
        );
      }
      throw error;
    }

    // Filter by search query if provided
    let filteredRepos = repos;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredRepos = repos.filter(
        (r) => r.name.toLowerCase().includes(searchLower) || r.full_name.toLowerCase().includes(searchLower)
      );
    }

    // Sort: public repos first, then by name
    filteredRepos.sort((a, b) => {
      if (a.private !== b.private) return a.private ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      repos: filteredRepos.map((r) => ({
        id: r.id,
        name: r.name,
        full_name: r.full_name,
        installation_id: installationId,
        owner_id: r.owner?.id ?? null,
        organization_id: r.owner?.type === 'Organization' ? (r.owner?.id ?? null) : null,
        html_url: r.html_url,
        description: r.description,
        private: r.private,
        default_branch: r.default_branch,
        language: r.language,
        updated_at: r.updated_at
      }))
    });
  } catch (err: unknown) {
    console.error('Error fetching repositories:', err);

    return NextResponse.json(
      {
        error: 'Failed to fetch repositories',
        detail: err instanceof Error ? err.message : String(err)
      },
      { status: 500 }
    );
  }
}
