import { serve } from "inngest/next";
import {
  inngest,
  knowledgeSourceSync,
  knowledgeSourceScheduledSync,
  dailyRampCheck,
  accessCoordinator,
  accessGrantedNotifier,
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
    dailyRampCheck,
    accessCoordinator,
    accessGrantedNotifier,
    readinessAnalysisOnDemand,
    readinessAnalysis,
    milestoneProposalGeneration,
    milestoneProposalScheduledGeneration,
  ],
});
