/**
 * Shared types for workspace providers
 */

export type WorkspaceInfo = {
	provider: string; // 'notion', 'confluence', etc.
	resourceId: string; // page ID, document ID, etc. (provider-specific)
	metadata?: Record<string, unknown>; // Additional provider-specific metadata
};

export type WorkspaceContent = {
	title: string;
	markdown: string;
	html?: string;
	metadata?: Record<string, unknown>;
};
