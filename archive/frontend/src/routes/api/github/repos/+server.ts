/**
 * API endpoint to list repositories for a GitHub user or organization
 * Supports both authenticated (user's repos) and anonymous (public org repos)
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { getUserOctokit } from '$lib/server/github/getUserOctokit';

function jsonResponse(data: unknown, status = 200) {
	return json(data, { status });
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const { owner, search } = body as { owner?: string; search?: string };

		if (!owner) {
			return jsonResponse({ error: 'owner is required' }, 400);
		}

		// Get user's GitHub connection (or anonymous if not connected)
		const { user } = await locals.safeGetSession();
		const octokit = await getUserOctokit(locals.supabase, user?.id || null);

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
		const repos: Array<{ name: string; full_name: string; private: boolean; url: string }> = [];

		try {
			// Try to get repos for the owner (user or org)
			const { data: userOrOrg } = await octokit.users.getByUsername({ username: owner });

			if (userOrOrg.type === 'User') {
				// If searching for authenticated user's own account, use listForAuthenticatedUser to get private repos
				if (authenticatedUsername && authenticatedUsername.toLowerCase() === owner.toLowerCase()) {
					// Get all repos the authenticated user has access to (includes private)
					const { data: allRepos } = await octokit.repos.listForAuthenticatedUser({
						sort: 'updated',
						per_page: 100,
						affiliation: 'owner' // Only repos owned by the user
					});
					if (Array.isArray(allRepos)) {
						repos.push(...allRepos.map((r) => ({
							name: r.name,
							full_name: r.full_name,
							private: r.private,
							url: r.html_url
						})));
					}
				} else {
					// For other users, list their public repos
					// Note: listForUser only returns public repos for other users
					const { data: userRepos } = await octokit.repos.listForUser({
						username: owner,
						sort: 'updated',
						per_page: 100
					});
					if (Array.isArray(userRepos)) {
						repos.push(...userRepos.map((r) => ({
							name: r.name,
							full_name: r.full_name,
							private: r.private,
							url: r.html_url
						})));
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
					repos.push(...orgRepos.map((r) => ({
						name: r.name,
						full_name: r.full_name,
						private: r.private,
						url: r.html_url
					})));
				}
			}
		} catch (error: any) {
			// If 404, owner doesn't exist or user doesn't have access
			if (error.status === 404) {
				return jsonResponse({ error: `User or organization '${owner}' not found or not accessible` }, 404);
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

		return jsonResponse({
			repos: filteredRepos.map((r) => ({
				name: r.name,
				full_name: r.full_name,
				url: r.url,
				private: r.private
			}))
		});
	} catch (err: any) {
		console.error('Error fetching repositories:', err);
		return jsonResponse(
			{
				error: 'Failed to fetch repositories',
				detail: err.message || String(err)
			},
			500
		);
	}
};

