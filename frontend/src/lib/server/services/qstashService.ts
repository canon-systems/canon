import { Client } from '@upstash/qstash';
import { parseSchedule } from './automationRules';

let qstashClient: Client | null = null;

/**
 * Get or create QStash client
 */
function getQStashClient(): Client {
  if (!qstashClient) {
    const token = process.env.QSTASH_TOKEN;
    const url = process.env.QSTASH_URL;

    if (!token) {
      throw new Error('QSTASH_TOKEN environment variable is required');
    }

    // Configure client for local development
    qstashClient = new Client({
      token,
      baseUrl: url || 'https://qstash.upstash.io' // fallback to production
    });
  }
  return qstashClient;
}

/**
 * Calculate delay in seconds until next run based on schedule
 */
export function calculateDelayUntilNextRun(schedule: string, fromTime = new Date()): number {
  const parsed = parseSchedule(schedule);
  const { schedule_type, schedule_config } = parsed;

  const now = fromTime;
  let nextRun = new Date(now);

  switch (schedule_type) {
    case 'daily':
      nextRun.setHours(schedule_config.hour || 0, schedule_config.minute || 0, 0, 0);
      if (nextRun <= now) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
      break;

    case 'weekly':
      const targetDay = schedule_config.day_of_week || 0;
      const currentDay = now.getDay();
      const daysUntilTarget = (targetDay - currentDay + 7) % 7;

      nextRun.setDate(now.getDate() + daysUntilTarget);
      nextRun.setHours(schedule_config.hour || 0, schedule_config.minute || 0, 0, 0);

      // If it's today but already passed, move to next week
      if (daysUntilTarget === 0 && nextRun <= now) {
        nextRun.setDate(nextRun.getDate() + 7);
      }
      break;

    case 'interval':
      // For interval schedules, calculate next run based on hours/minutes
      if (schedule_config.minutes) {
        nextRun.setTime(now.getTime() + (schedule_config.minutes * 60 * 1000));
      } else if (schedule_config.hours) {
        nextRun.setTime(now.getTime() + (schedule_config.hours * 60 * 60 * 1000));
      } else {
        // Default to 24 hours
        nextRun.setTime(now.getTime() + (24 * 60 * 60 * 1000));
      }
      break;

    default:
      // Default to daily at midnight
      nextRun.setHours(0, 0, 0, 0);
      if (nextRun <= now) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
  }

  return Math.max(0, Math.floor((nextRun.getTime() - now.getTime()) / 1000));
}

/**
 * Schedule an automation rule with QStash
 */
export async function scheduleAutomationRule({
  userId,
  repoId,
  ruleId,
  schedule,
  baseUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'
}: {
  userId: string;
  repoId: string;
  ruleId: string;
  schedule: string;
  baseUrl?: string;
}): Promise<{ success: boolean; messageId?: string; nextRun?: Date; error?: string }> {
  try {
    const qstash = getQStashClient();
    const delay = calculateDelayUntilNextRun(schedule);
    const nextRun = new Date(Date.now() + delay * 1000);

    const result = await qstash.publishJSON({
      url: `${baseUrl}/api/automation/execute`,
      body: {
        userId,
        repoId,
        ruleId,
        scheduled: true
      },
      delay,
      // Add retry configuration for reliability
      retries: 3,
      // Add message deduplication
      deduplicationId: `automation-${userId}-${repoId}-${ruleId}-${nextRun.getTime()}`
    });

    return {
      success: true,
      messageId: result.messageId,
      nextRun
    };
  } catch (error: any) {
    console.error('Failed to schedule automation rule:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Cancel a scheduled automation rule
 */
export async function cancelScheduledAutomation(messageId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const qstash = getQStashClient();
    await qstash.messages.delete(messageId);
    return { success: true };
  } catch (error: any) {
    console.error('Failed to cancel scheduled automation:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Send automation execution to queue immediately (for manual triggers)
 */
export async function queueAutomationExecution({
  userId,
  repoId,
  ruleId,
  baseUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'
}: {
  userId: string;
  repoId: string;
  ruleId: string;
  baseUrl?: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const qstash = getQStashClient();

    const result = await qstash.publishJSON({
      url: `${baseUrl}/api/automation/execute`,
      body: {
        userId,
        repoId,
        ruleId,
        scheduled: false,
        manual: true
      },
      delay: 0, // Execute immediately
      retries: 3
    });

    return {
      success: true,
      messageId: result.messageId
    };
  } catch (error: any) {
    console.error('Failed to queue automation execution:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Reschedule an automation rule after successful execution
 */
export async function rescheduleAutomationRule({
  userId,
  repoId,
  ruleId,
  schedule,
  baseUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'
}: {
  userId: string;
  repoId: string;
  ruleId: string;
  schedule: string;
  baseUrl?: string;
}): Promise<{ success: boolean; messageId?: string; nextRun?: Date; error?: string }> {
  // This is essentially the same as scheduleAutomationRule
  return scheduleAutomationRule({ userId, repoId, ruleId, schedule, baseUrl });
}
