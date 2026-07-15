import { serve } from "inngest/next";
import {
  inngest,
  askNewHireToConfirmToolAccess,
  calendarMeetingSync,
  checkMeetingPrep,
  generateMilestoneProposals,
  generateReadinessUpdatesOnDemand,
  notifyToolOwnerForAccessRequest,
  scanMilestoneEvidence,
  sendDueReadinessDigest,
  sendNextDueRampMilestone,
  syncKnowledgeSource,
} from "../../../inngest";

export const runtime = 'nodejs';
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    syncKnowledgeSource,
    calendarMeetingSync,
    sendNextDueRampMilestone,
    notifyToolOwnerForAccessRequest,
    askNewHireToConfirmToolAccess,
    generateReadinessUpdatesOnDemand,
    sendDueReadinessDigest,
    checkMeetingPrep,
    scanMilestoneEvidence,
    generateMilestoneProposals,
  ],
});
