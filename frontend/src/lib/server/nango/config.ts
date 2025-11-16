/**
 * Nango Configuration
 * 
 * Centralized configuration for Nango OAuth integrations
 * Supports multiple knowledge management platforms
 */

import { env } from '$env/dynamic/private';
import { PUBLIC_NANGO_HOST } from '$env/static/public';

export const NANGO_CONFIG = {
	// Server-side secret key (from Nango dashboard)
	// Required for API calls to Nango (including creating Connect sessions)
	secretKey: env.NANGO_SECRET_KEY || '',
	
	// Nango host URL
	// Default: https://api.nango.dev (cloud)
	// For self-hosted: your Nango instance URL
	host: env.NANGO_HOST || PUBLIC_NANGO_HOST || 'https://api.nango.dev',
	
	// Integration providers configuration
	providers: {
		notion: {
			providerConfigKey: 'notion',
			oauthScopes: ['read', 'write'],
			// Additional provider-specific config can go here
		},
		confluence: {
			providerConfigKey: 'confluence',
			// Confluence OAuth 2.0 scopes - these must match what's configured in Nango dashboard
			// Required scopes:
			// - read:confluence-space.summary: View space information (to list spaces)
			// - read:page:confluence: Read Confluence pages
			// - write:page:confluence: Create or update Confluence pages
			// - offline_access: Access refresh tokens for offline use
			oauthScopes: [
				'read:confluence-space.summary',
				'read:page:confluence',
				'write:page:confluence',
				'offline_access'
			],
		},
		'google-docs': {
			// IMPORTANT: This must match the exact "Integration ID" (provider config key) 
			// you set in your Nango dashboard when creating the Google Docs integration
			// Common values: 'google-docs', 'googledocs', or 'google'
			// Check your Nango dashboard: Integrations -> [Your Google Docs Integration] -> Integration ID
			providerConfigKey: 'google-docs', // Update this to match your Nango dashboard
			oauthScopes: ['https://www.googleapis.com/auth/documents', 'https://www.googleapis.com/auth/drive.file'],
		},
		// Future integrations - ready to add
		// slack: {
		// 	providerConfigKey: 'slack',
		// 	oauthScopes: ['channels:read', 'chat:write'],
		// },
		// jira: {
		// 	providerConfigKey: 'jira',
		// 	oauthScopes: ['read', 'write'],
		// },
	}
} as const;

export type IntegrationProvider = keyof typeof NANGO_CONFIG.providers;

