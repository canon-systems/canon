import { serve } from "inngest/next";
import {
  inngest,
  askNewHireToConfirmToolAccess,
  calendarMeetingSync,
  calendarMeetingSyncOnSchedule,
  checkMeetingPrep,
  checkMeetingPrepOnSchedule,
  generateMilestoneProposals,
  generateReadinessUpdatesOnDemand,
  notifyToolOwnerForAccessRequest,
  scanMilestoneEvidence,
  scanMilestoneEvidenceOnSchedule,
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
    calendarMeetingSyncOnSchedule,
    sendNextDueRampMilestone,
    notifyToolOwnerForAccessRequest,
    askNewHireToConfirmToolAccess,
    generateReadinessUpdatesOnDemand,
    sendDueReadinessDigest,
    checkMeetingPrep,
    checkMeetingPrepOnSchedule,
    scanMilestoneEvidence,
    scanMilestoneEvidenceOnSchedule,
    generateMilestoneProposals,
  ],
});
