import { serve } from "inngest/next";
import {
  inngest,
  diffSourceBackfill,
  ingestJiraWebhook,
  sourceIngestRequested,
  dailySignalAlerts,
} from "../../../inngest";

export const runtime = 'nodejs';
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    // checkAndRunAutomations,
    dailySignalAlerts,
    diffSourceBackfill,
    ingestJiraWebhook,
    sourceIngestRequested,
  ],
});
