import { NextRequest, NextResponse } from 'next/server';
import { getUserOctokit } from '@/lib/server/github/getUserOctokit';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';

/**
 * API endpoint to list repositories for a GitHub user or organization
 * Requires authenticated GitHub connection
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { owner, search } = body as { owner?: string; search?: string };

    if (!owner) {
      return NextResponse.json({ error: 'owner is required' }, { status: 400 });
    }

    // Require authentication and GitHub connection
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const supabase = await createClient();
    const octokit = await getUserOctokit(supabase, user.id);

    // Get authenticated user's GitHub username if authenticated
    // Try to get authenticated user - if this succeeds, user has GitHub connected
    let authenticatedUsername: string | null = null;
    try {
      const { data: authUser } = await octokit.users.getAuthenticated();
      authenticatedUsername = authUser.login;
    } catch {
      // User is not authenticated (no GitHub connection or anonymous access)
      // Continue with public repos only
    }

    // Fetch repositories for the owner
    // For authenticated users, this includes private repos they have access to
    // For anonymous, this only returns public repos
    const repos: any[] = [];

    try {
      // Special owner token to fetch everything the authenticated user can see (public + private)
      if (['me', '@me', 'self', '@self'].includes(owner.toLowerCase())) {
        const { data: allRepos } = await octokit.repos.listForAuthenticatedUser({
          sort: 'updated',
          per_page: 100,
          affiliation: 'owner,collaborator,organization_member' // includes repos you can access (private + public)
        });
        if (Array.isArray(allRepos)) {
          repos.push(...allRepos);
        }
      } else {
        // Try to get repos for the owner (user or org)
        const { data: userOrOrg } = await octokit.users.getByUsername({ username: owner });

        if (userOrOrg.type === 'User') {
          // If searching for authenticated user's own account, use listForAuthenticatedUser to get private repos
          if (authenticatedUsername && authenticatedUsername.toLowerCase() === owner.toLowerCase()) {
            // Get all repos the authenticated user OWNS (not collaborator repos)
            const { data: allRepos } = await octokit.repos.listForAuthenticatedUser({
              sort: 'updated',
              per_page: 100,
              affiliation: 'owner' // CRITICAL: Only repos owned by the user, not collaborator repos
            });
            if (Array.isArray(allRepos)) {
              // Double-check: filter to ensure owner matches exactly (case-insensitive)
              const ownerLower = owner.toLowerCase();
              repos.push(...allRepos
                .filter((r) => {
                  const repoOwner = r.owner?.login?.toLowerCase();
                  return repoOwner === ownerLower;
                }));
            }
          } else {
            // For other users, list their public repos only
            // Note: listForUser only returns public repos for other users
            const { data: userRepos } = await octokit.repos.listForUser({
              username: owner,
              sort: 'updated',
              per_page: 100
            });
            if (Array.isArray(userRepos)) {
              // Filter to ensure owner matches exactly (case-insensitive)
              const ownerLower = owner.toLowerCase();
              repos.push(...userRepos
                .filter((r) => {
                  const repoOwner = r.owner?.login?.toLowerCase();
                  return repoOwner === ownerLower;
                }));
            }
          }
        } else if (userOrOrg.type === 'Organization') {
          // List organization's repositories
          // For authenticated users, this may include private org repos they have access to
          const { data: orgRepos } = await octokit.repos.listForOrg({
            org: owner,
            sort: 'updated',
            per_page: 100,
            type: 'all' // Include all types (public, private, etc.)
          });
          if (Array.isArray(orgRepos)) {
            // Filter to ensure owner matches exactly (case-insensitive)
            const ownerLower = owner.toLowerCase();
            repos.push(...orgRepos
              .filter((r) => {
                const repoOwner = r.owner?.login?.toLowerCase();
                return repoOwner === ownerLower;
              }));
          }
        }
      }
    } catch (error: any) {
      // If 404, owner doesn't exist or user doesn't have access
      if (error.status === 404) {
        return NextResponse.json({ error: `User or organization '${owner}' not found or not accessible` }, { status: 404 });
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
        html_url: r.html_url,
        description: r.description,
        private: r.private,
        default_branch: r.default_branch,
        language: r.language,
        updated_at: r.updated_at
      }))
    });
  } catch (err: any) {
    console.error('Error fetching repositories:', err);

    // Handle GitHub connection errors specifically
    if (err.message?.includes('GitHub connection') || err.message?.includes('GitHub not connected')) {
      return NextResponse.json(
        {
          error: 'GitHub connection required',
          detail: err.message
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to fetch repositories',
        detail: err.message || String(err)
      },
      { status: 500 }
    );
  }
}
