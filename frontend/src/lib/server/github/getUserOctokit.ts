/**
 * Get Octokit instance for GitHub App installation
 * OAuth user tokens are not used.
 */

import { Octokit } from '@octokit/rest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getGitHubAppOctokitForRepo } from './appAuth';

/**
 * Get Octokit instance for GitHub App installation
 * - Resolves installation by repository (multi-tenant safe)
 */
export async function getUserOctokit(
	_supabase: SupabaseClient,
	_userId: string | null,
	owner: string,
	repo: string
): Promise<Octokit> {
	return getGitHubAppOctokitForRepo(owner, repo);
}

/**
 * Check if user has valid GitHub connection (with working token)
 */
export async function hasGitHubConnection(
	_supabase: SupabaseClient,
	_userId: string | null,
	owner: string,
	repo: string
): Promise<boolean> {
	try {
		await getUserOctokit(_supabase, _userId, owner, repo);
		return true;
	} catch {
		return false;
	}
}
