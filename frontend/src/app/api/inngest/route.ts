import { serve } from "inngest/next";
import {
  inngest,
  slackKnowledgeSync,
  dailyRampCheck,
  accessCoordinator,
} from "../../../inngest";

export const runtime = 'nodejs';
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    slackKnowledgeSync,
    dailyRampCheck,
    accessCoordinator,
  ],
});
