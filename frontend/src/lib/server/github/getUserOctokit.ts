/**
 * Get Octokit instance for a user's GitHub connection
 * Returns Octokit with user's token if connected, or anonymous Octokit for public repos
 * NEVER uses global GITHUB_TOKEN
 */

import { Octokit } from '@octokit/rest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getGitHubTokenForUser } from './getUserToken';

/**
 * Get user's GitHub connection ID from Supabase
 */
async function getUserGitHubConnection(
	supabase: SupabaseClient,
	userId: string | null
): Promise<string | null> {
	if (!userId) {
		return null;
	}

	try {
		const { data, error } = await supabase
			.from('oauth_connections')
			.select('connection_id')
			.eq('user_id', userId)
			.eq('provider', 'github')
			.eq('status', 'active')
			.single();

		if (error || !data) {
			return null;
		}

		return data.connection_id;
	} catch (error) {
		console.error('Error fetching GitHub connection:', error);
		return null;
	}
}

/**
 * Get Octokit instance for a user
 * - If user has GitHub connected: returns authenticated Octokit
 * - If user doesn't have GitHub connected or userId is null: returns anonymous Octokit (public repos only)
 * - NEVER uses global GITHUB_TOKEN
 */
export async function getUserOctokit(
	supabase: SupabaseClient,
	userId: string | null
): Promise<Octokit> {
	const connectionId = await getUserGitHubConnection(supabase, userId);
	
	if (connectionId) {
		const token = await getGitHubTokenForUser(connectionId);
		if (token) {
			return new Octokit({ auth: token });
		}
	}

	// No connection or token - return anonymous Octokit (public repos only)
	return new Octokit();
}

/**
 * Check if user has GitHub connected
 */
export async function hasGitHubConnection(
	supabase: SupabaseClient,
	userId: string | null
): Promise<boolean> {
	const connectionId = await getUserGitHubConnection(supabase, userId);
	return connectionId !== null;
}

