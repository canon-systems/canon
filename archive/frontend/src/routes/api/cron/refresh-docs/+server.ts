// ============================================================================
// /api/cron/refresh-docs  (GET or POST)
//
// PURPOSE:
//   Cron endpoint that:
//     1. Checks all submissions for outdated files (batch-check)
//     2. Automatically refreshes all outdated submissions (batch-refresh)
//
//   This endpoint should be called by:
//     - Vercel Cron Jobs
//     - GitHub Actions
//     - External cron service (cron-job.org, etc.)
//     - Manual trigger for testing
//
// SECURITY:
//   This endpoint should be protected with a secret token to prevent
//   unauthorized access. Set CRON_SECRET in your environment.
//
// RETURNS:
//   {
//      checked: number,
//      outdated: number,
//      refreshed: number,
//      failed: number,
//      message: "..."
//   }
// ============================================================================

import type { RequestHandler } from '@sveltejs/kit'
import { json, error } from '@sveltejs/kit'
import { env } from '$env/dynamic/private'

const CRON_SECRET = env.CRON_SECRET

export const GET: RequestHandler = async ({ request, url, locals: { supabase } }) => {
    return handleCron(request, url, supabase)
}

export const POST: RequestHandler = async ({ request, url, locals: { supabase } }) => {
    return handleCron(request, url, supabase)
}

async function handleCron(request: Request, url: URL, supabase: any) {
    try {
        // Security: Verify cron secret or Vercel cron header
        // Vercel automatically adds 'x-vercel-cron' header for cron jobs
        const isVercelCron = request.headers.get('x-vercel-cron') === '1'
        const authHeader = request.headers.get('authorization')
        const secretParam = url.searchParams.get('secret')
        const providedSecret = authHeader?.replace('Bearer ', '') || secretParam

        // Allow if it's a Vercel cron job OR if the secret matches
        if (!isVercelCron) {
            if (!CRON_SECRET) {
                console.warn('CRON_SECRET not set - allowing request (not recommended for production)')
            } else if (providedSecret !== CRON_SECRET) {
                return error(401, 'Unauthorized: Invalid cron secret')
            }
        }

        // Step 1: Batch check for outdated submissions
        const checkResponse = await fetch(`${url.origin}/api/docs/batch-check`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            }
        })

        if (!checkResponse.ok) {
            const checkError = await checkResponse.json().catch(() => ({}))
            throw new Error(`Batch check failed: ${checkError.error || checkResponse.statusText}`)
        }

        const checkResult = await checkResponse.json()
        const { checked, outdated } = checkResult

        // Step 2: If there are outdated submissions, refresh them
        let refreshed = 0
        let failed = 0

        if (outdated > 0) {
            const refreshResponse = await fetch(`${url.origin}/api/docs/batch-refresh`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json'
                }
            })

            if (!refreshResponse.ok) {
                const refreshError = await refreshResponse.json().catch(() => ({}))
                throw new Error(`Batch refresh failed: ${refreshError.error || refreshResponse.statusText}`)
            }

            const refreshResult = await refreshResponse.json()
            refreshed = refreshResult.refreshed || 0
            failed = refreshResult.failed || 0
        }

        return json({
            success: true,
            checked,
            outdated,
            refreshed,
            failed,
            message: `Checked ${checked} submissions. ${outdated} were outdated, ${refreshed} refreshed successfully, ${failed} failed.`,
            timestamp: new Date().toISOString()
        })
    } catch (err: unknown) {
        console.error('Error in /api/cron/refresh-docs', err)
        const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error'
        return error(500, `Cron job failed: ${message}`)
    }
}

