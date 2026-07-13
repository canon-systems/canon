import type { SlackMessage } from '@/lib/server/knowledge-sync/slack-client';

const CANON_READINESS_PATTERNS = [
  /(^|\n)\*(readiness|product changes|customer objections|demo guidance|implementation patterns|product|weekly readiness|meeting prep) update\*/i,
  /\bthis week's readiness updates\b/i,
  /\bweekly readiness digest\b/i,
  /\bmeeting prep\b/i,
  /\bcanon recommends\b/i,
];

export function isCanonGeneratedSlackMessage(message: SlackMessage) {
  const username = message.username?.toLowerCase() ?? '';
  const text = message.text ?? '';

  if (message.subtype) return true;
  if (message.bot_id || message.app_id) return true;
  if (username.includes('canon')) return true;
  return CANON_READINESS_PATTERNS.some((pattern) => pattern.test(text));
}

export function syncableSlackMessages(messages: SlackMessage[], minMessageLength: number) {
  return messages.filter((message) => (
    !isCanonGeneratedSlackMessage(message) &&
    Boolean(message.text) &&
    message.text.length >= minMessageLength
  ));
}
