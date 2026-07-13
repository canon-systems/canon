import { serve } from "inngest/next";
import {
  inngest,
  calendarMeetingSync,
  knowledgeSourceSync,
  knowledgeSourceScheduledSync,
  dailyRampCheck,
  accessCoordinator,
  accessGrantedNotifier,
  meetingPrepBriefing,
  readinessAnalysis,
  readinessAnalysisOnDemand,
  milestoneProposalGeneration,
  milestoneProposalScheduledGeneration,
} from "../../../inngest";

export const runtime = 'nodejs';
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    knowledgeSourceSync,
    knowledgeSourceScheduledSync,
    calendarMeetingSync,
    dailyRampCheck,
    accessCoordinator,
    accessGrantedNotifier,
    readinessAnalysisOnDemand,
    readinessAnalysis,
    meetingPrepBriefing,
    milestoneProposalGeneration,
    milestoneProposalScheduledGeneration,
  ],
});
