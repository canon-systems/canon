/**
 * Simple in-memory cache for GitHub API responses
 * Reduces redundant API calls and rate limit consumption
 * 
 * Note: This cache is per-instance and will be cleared on server restart.
 * For production, consider using Redis or another distributed cache.
 */

type CacheEntry<T> = {
	data: T;
	expires: number;
	etag?: string;
};

// In-memory cache store
const cache = new Map<string, CacheEntry<unknown>>();

// Default TTLs (in milliseconds)
export const TTL = {
	BRANCH: 30_000,       // 30 seconds - branches change frequently
	COMMIT_SHA: 60_000,   // 1 minute - commit SHAs are immutable once known
	TREE: 300_000,        // 5 minutes - tree data at a specific SHA is immutable
	FILE_CONTENT: 600_000, // 10 minutes - file content at specific SHA is immutable
	FILE_SHA: 600_000,    // 10 minutes - file SHAs are immutable for a given tree
};

/**
 * Get a cached value if it exists and hasn't expired
 */
export function getCached<T>(key: string): T | null {
	const entry = cache.get(key);
	if (entry && entry.expires > Date.now()) {
		return entry.data as T;
	}
	// Clean up expired entry
	if (entry) {
		cache.delete(key);
	}
	return null;
}

/**
 * Set a cached value with TTL
 */
export function setCache<T>(key: string, data: T, ttlMs: number): void {
	cache.set(key, {
		data,
		expires: Date.now() + ttlMs,
	});
}

/**
 * Get cached value with its ETag for conditional requests
 */
export function getCachedWithEtag<T>(key: string): { data: T; etag: string } | null {
	const entry = cache.get(key);
	if (entry && entry.expires > Date.now() && entry.etag) {
		return { data: entry.data as T, etag: entry.etag };
	}
	return null;
}

/**
 * Set cached value with ETag
 */
export function setCacheWithEtag<T>(key: string, data: T, etag: string, ttlMs: number): void {
	cache.set(key, {
		data,
		expires: Date.now() + ttlMs,
		etag,
	});
}

/**
 * Delete a specific cache entry
 */
export function deleteCache(key: string): void {
	cache.delete(key);
}

/**
 * Clear all cache entries
 */
export function clearCache(): void {
	cache.clear();
}

/**
 * Clear expired entries (garbage collection)
 */
export function clearExpired(): number {
	const now = Date.now();
	let cleared = 0;
	for (const [key, entry] of cache.entries()) {
		if (entry.expires <= now) {
			cache.delete(key);
			cleared++;
		}
	}
	return cleared;
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; keys: string[] } {
	return {
		size: cache.size,
		keys: Array.from(cache.keys()),
	};
}

// Cache key builders for consistency
export const cacheKey = {
	branch: (owner: string, repo: string, branch: string) =>
		`branch:${owner}/${repo}/${branch}`,
	
	tree: (owner: string, repo: string, sha: string) =>
		`tree:${owner}/${repo}/${sha}`,
	
	fileContent: (owner: string, repo: string, path: string, ref: string) =>
		`file:${owner}/${repo}/${path}@${ref}`,
	
	fileShas: (owner: string, repo: string, sha: string) =>
		`shas:${owner}/${repo}/${sha}`,
	
	zipArchive: (owner: string, repo: string, ref: string) =>
		`zip:${owner}/${repo}/${ref}`,
};

// Helper function to format timestamp for logs
function getTimestamp(): string {
	return new Date().toISOString();
}

// Run garbage collection periodically (every 5 minutes)
if (typeof setInterval !== 'undefined') {
	setInterval(() => {
		const cleared = clearExpired();
		if (cleared > 0) {
			console.log(`[${getTimestamp()}] [GitHub Cache] Cleared ${cleared} expired entries`);
		}
	}, 300_000);
}

