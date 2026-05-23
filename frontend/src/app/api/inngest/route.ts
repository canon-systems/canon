import { serve } from "inngest/next";
import {
  inngest,
  knowledgeSourceSync,
  knowledgeSourceScheduledSync,
  dailyRampCheck,
  accessCoordinator,
  readinessAnalysis,
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
    readinessAnalysis,
  ],
});
