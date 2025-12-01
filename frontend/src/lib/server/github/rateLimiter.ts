/**
 * GitHub API Rate Limit Awareness
 * Tracks rate limit status and provides backoff functionality
 * 
 * GitHub Rate Limits:
 * - Authenticated: 5,000 requests/hour
 * - Unauthenticated: 60 requests/hour
 */

type RateLimitState = {
	limit: number;
	remaining: number;
	reset: number; // Unix timestamp in seconds
	used: number;
	resource: string;
};

// Global rate limit state
let rateLimitState: RateLimitState = {
	limit: 5000,
	remaining: 5000,
	reset: 0,
	used: 0,
	resource: 'core',
};

// Track when we last logged a warning
let lastWarningTime = 0;
const WARNING_INTERVAL = 60_000; // Only warn every 60 seconds

/**
 * Update rate limit state from GitHub API response headers
 * Call this after every GitHub API request
 */
export function updateRateLimitFromHeaders(headers: Record<string, string | undefined>): void {
	const remaining = headers['x-ratelimit-remaining'];
	const limit = headers['x-ratelimit-limit'];
	const reset = headers['x-ratelimit-reset'];
	const used = headers['x-ratelimit-used'];
	const resource = headers['x-ratelimit-resource'];

	if (remaining !== undefined) {
		rateLimitState.remaining = parseInt(remaining, 10);
	}
	if (limit !== undefined) {
		rateLimitState.limit = parseInt(limit, 10);
	}
	if (reset !== undefined) {
		rateLimitState.reset = parseInt(reset, 10);
	}
	if (used !== undefined) {
		rateLimitState.used = parseInt(used, 10);
	}
	if (resource !== undefined) {
		rateLimitState.resource = resource;
	}

	// Log warning if running low
	const now = Date.now();
	if (rateLimitState.remaining < 100 && now - lastWarningTime > WARNING_INTERVAL) {
		console.warn(
			`[GitHub Rate Limit] Low: ${rateLimitState.remaining}/${rateLimitState.limit} remaining. ` +
			`Resets at ${new Date(rateLimitState.reset * 1000).toISOString()}`
		);
		lastWarningTime = now;
	}
}

/**
 * Get current rate limit status
 */
export function getRateLimitStatus(): {
	remaining: number;
	limit: number;
	used: number;
	resetAt: Date;
	percentUsed: number;
	isLow: boolean;
	isCritical: boolean;
} {
	const resetAt = new Date(rateLimitState.reset * 1000);
	const percentUsed = rateLimitState.limit > 0
		? ((rateLimitState.limit - rateLimitState.remaining) / rateLimitState.limit) * 100
		: 0;

	return {
		remaining: rateLimitState.remaining,
		limit: rateLimitState.limit,
		used: rateLimitState.used,
		resetAt,
		percentUsed: Math.round(percentUsed * 10) / 10,
		isLow: rateLimitState.remaining < 500,
		isCritical: rateLimitState.remaining < 100,
	};
}

/**
 * Check if we should wait before making more requests
 * Returns the number of milliseconds to wait (0 if no wait needed)
 */
export function shouldWait(): number {
	// If we have plenty of remaining requests, no need to wait
	if (rateLimitState.remaining > 100) {
		return 0;
	}

	// If we're critically low, calculate wait time until reset
	if (rateLimitState.remaining < 50) {
		const now = Math.floor(Date.now() / 1000);
		const waitSeconds = Math.max(0, rateLimitState.reset - now);
		return Math.min(waitSeconds * 1000, 60_000); // Cap at 60 seconds
	}

	// If we're running low, add a small delay between requests
	if (rateLimitState.remaining < 100) {
		return 1000; // 1 second delay
	}

	return 0;
}

/**
 * Wait if rate limited
 * Call this before making GitHub API requests when doing bulk operations
 */
export async function waitIfRateLimited(): Promise<void> {
	const waitMs = shouldWait();
	if (waitMs > 0) {
		console.log(
			`[GitHub Rate Limit] Waiting ${waitMs}ms (${rateLimitState.remaining} requests remaining)`
		);
		await new Promise(resolve => setTimeout(resolve, waitMs));
	}
}

/**
 * Decorator/wrapper for Octokit methods that automatically updates rate limit state
 */
export function withRateLimitTracking<T extends (...args: any[]) => Promise<any>>(
	fn: T
): T {
	return (async (...args: Parameters<T>) => {
		// Wait if we're rate limited before making the request
		await waitIfRateLimited();

		const result = await fn(...args);

		// Update rate limit state from response headers
		if (result && result.headers) {
			updateRateLimitFromHeaders(result.headers as Record<string, string>);
		}

		return result;
	}) as T;
}

/**
 * Calculate optimal batch size based on current rate limit status
 * Use this when deciding how many items to process in parallel
 */
export function getOptimalBatchSize(
	defaultSize: number = 10,
	minSize: number = 1,
	maxSize: number = 20
): number {
	const status = getRateLimitStatus();

	if (status.isCritical) {
		return minSize;
	}

	if (status.isLow) {
		return Math.max(minSize, Math.floor(defaultSize / 2));
	}

	// Scale batch size based on remaining quota
	const quotaFactor = status.remaining / status.limit;
	if (quotaFactor > 0.5) {
		return maxSize;
	}
	if (quotaFactor > 0.25) {
		return defaultSize;
	}

	return Math.max(minSize, Math.floor(defaultSize * quotaFactor * 2));
}

/**
 * Estimate if we have enough quota for an operation
 * Use this to decide whether to proceed or wait
 */
export function hasQuotaFor(estimatedCalls: number): boolean {
	// Add 10% buffer
	const requiredWithBuffer = Math.ceil(estimatedCalls * 1.1);
	return rateLimitState.remaining >= requiredWithBuffer;
}

/**
 * Reset rate limit state (useful for testing or when user reconnects)
 */
export function resetRateLimitState(): void {
	rateLimitState = {
		limit: 5000,
		remaining: 5000,
		reset: 0,
		used: 0,
		resource: 'core',
	};
}

