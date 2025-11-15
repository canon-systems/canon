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
		// Future integrations - ready to add
		// slack: {
		// 	providerConfigKey: 'slack',
		// 	oauthScopes: ['channels:read', 'chat:write'],
		// },
		// jira: {
		// 	providerConfigKey: 'jira',
		// 	oauthScopes: ['read', 'write'],
		// },
		// confluence: {
		// 	providerConfigKey: 'confluence',
		// 	oauthScopes: ['read', 'write'],
		// },
	}
} as const;

export type IntegrationProvider = keyof typeof NANGO_CONFIG.providers;

