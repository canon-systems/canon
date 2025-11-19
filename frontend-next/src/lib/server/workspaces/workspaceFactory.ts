/**
 * Factory for getting workspace providers
 */

import type { WorkspaceProvider } from './base';
import { NotionProvider } from './providers/notion';
import { ConfluenceProvider } from './providers/confluence';
import { GoogleDocsProvider } from './providers/googledocs';

const providers: WorkspaceProvider[] = [
	new NotionProvider(),
	new ConfluenceProvider(),
	new GoogleDocsProvider(),
	// Add future providers here
];

/**
 * Get workspace provider by name
 */
export function getWorkspaceProvider(providerName: string): WorkspaceProvider | null {
	return providers.find((p) => p.name === providerName) || null;
}

/**
 * Detect workspace provider from workspace info
 */
export function detectWorkspaceProvider(workspaceInfo: { provider?: string }): string | null {
	return workspaceInfo?.provider || null;
}

/**
 * List all available workspace providers
 */
export function listWorkspaceProviders(): string[] {
	return providers.map((p) => p.name);
}

