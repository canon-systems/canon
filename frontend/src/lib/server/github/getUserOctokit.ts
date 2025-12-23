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
 * - If user doesn't have GitHub connected or userId is null: throws error (no anonymous access)
 * - NEVER uses global GITHUB_TOKEN
 */
export async function getUserOctokit(
	supabase: SupabaseClient,
	userId: string | null
): Promise<Octokit> {
	if (!userId) {
		throw new Error('User not authenticated. Please log in to access GitHub repositories.');
	}

	const connectionId = await getUserGitHubConnection(supabase, userId);
	if (!connectionId) {
		throw new Error('GitHub not connected. Please connect your GitHub account to access repositories.');
	}
	
		const token = await getGitHubTokenForUser(connectionId);
	if (!token) {
		// Mark connection as inactive since token fetch failed
		await supabase
			.from('oauth_connections')
			.update({ status: 'inactive' })
			.eq('connection_id', connectionId)
			.eq('user_id', userId);

		throw new Error('GitHub connection is invalid or expired. Please reconnect your GitHub account.');
	}

	return new Octokit({ auth: token });
}

/**
 * Check if user has valid GitHub connection (with working token)
 */
export async function hasGitHubConnection(
	supabase: SupabaseClient,
	userId: string | null
): Promise<boolean> {
	try {
		await getUserOctokit(supabase, userId);
		return true;
	} catch {
		return false;
	}
}

