import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { queueAutomationExecution } from '@/lib/server/services/qstashService';

/**
 * Manual trigger endpoint for automation rules using QStash queuing.
 *
 * Request body:
 * - userId: string (required) - The user ID
 * - repoId: string (required) - The repository ID
 * - ruleId: string (required) - The automation rule ID
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { userId, repoId, ruleId } = body;

    if (!userId || !repoId || !ruleId) {
      return NextResponse.json({
        error: 'Missing required fields: userId, repoId, ruleId'
      }, { status: 400 });
    }

    // Ensure user can only trigger their own automations
    if (userId !== user.id) {
      return NextResponse.json({
        error: 'You can only trigger automations for your own account'
      }, { status: 403 });
    }

    const result = await queueAutomationExecution({
      userId,
      repoId,
      ruleId,
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        queued: true,
        messageId: result.messageId,
        message: 'Automation queued for immediate execution'
      });
    } else {
      return NextResponse.json({
        error: 'Failed to queue automation',
        detail: result.error
      }, { status: 500 });
    }
  } catch (err: any) {
    console.error('Automation run error:', err);
    return NextResponse.json({
      error: 'Automation run failed',
      detail: err.message || String(err)
    }, { status: 500 });
  }
}

