import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getUserOctokit } from '@/lib/server/github/getUserOctokit';
import { getRateLimitStatus, updateRateLimitFromHeaders } from '@/lib/server/github/rateLimiter';
import { getCacheStats } from '@/lib/server/github/cache';

/**
 * GET: Check GitHub API rate limit status
 * Returns both the cached status and fresh status from GitHub API
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const octokit = await getUserOctokit(supabase, user.id);

    // Get cached rate limit status (no API call)
    const cachedStatus = getRateLimitStatus();

    // Optionally fetch fresh status from GitHub API
    const refreshParam = request.nextUrl.searchParams.get('refresh');
    let freshStatus = null;

    if (refreshParam === 'true') {
      try {
        const { data, headers } = await octokit.rateLimit.get();
        
        // Update our tracked state
        updateRateLimitFromHeaders(headers as Record<string, string>);

        freshStatus = {
          core: {
            limit: data.resources.core.limit,
            remaining: data.resources.core.remaining,
            used: data.resources.core.used,
            reset: new Date(data.resources.core.reset * 1000).toISOString(),
          },
          search: {
            limit: data.resources.search.limit,
            remaining: data.resources.search.remaining,
            used: data.resources.search.used,
            reset: new Date(data.resources.search.reset * 1000).toISOString(),
          },
          graphql: data.resources.graphql ? {
            limit: data.resources.graphql.limit,
            remaining: data.resources.graphql.remaining,
            used: data.resources.graphql.used,
            reset: new Date(data.resources.graphql.reset * 1000).toISOString(),
          } : null,
        };
      } catch (e) {
        console.error('Error fetching fresh rate limit:', e);
      }
    }

    // Get cache statistics
    const cacheStats = getCacheStats();

    return NextResponse.json({
      cached: {
        remaining: cachedStatus.remaining,
        limit: cachedStatus.limit,
        used: cachedStatus.used,
        resetAt: cachedStatus.resetAt.toISOString(),
        percentUsed: cachedStatus.percentUsed,
        isLow: cachedStatus.isLow,
        isCritical: cachedStatus.isCritical,
      },
      fresh: freshStatus,
      cache: {
        size: cacheStats.size,
        note: 'Cache entries are automatically cleaned up every 5 minutes',
      },
      tips: [
        cachedStatus.isCritical 
          ? '⚠️ Rate limit critical! Operations may fail. Wait for reset.'
          : cachedStatus.isLow
            ? '⚡ Rate limit running low. Consider reducing operations.'
            : '✓ Rate limit healthy.',
        'Connect your GitHub account for 5,000 requests/hour (vs 60 without)',
        'Use ZIP download for bulk file operations (1 API call instead of many)',
      ],
    });
  } catch (err: any) {
    console.error('Rate limit check error:', err);
    return NextResponse.json(
      {
        error: 'Failed to check rate limit',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

