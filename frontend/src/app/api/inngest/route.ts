import { serve } from "inngest/next";
import {
  inngest,
  syncCanonSources,
  reportScheduleTick,
  reportScheduleBootstrap,
  diffSourceBackfill,
  ingestJiraWebhook,
  sourceIngestRequested,
} from "../../../inngest";

export const runtime = 'nodejs';
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    // checkAndRunAutomations,
    syncCanonSources,
    reportScheduleTick,
    reportScheduleBootstrap,
    diffSourceBackfill,
    ingestJiraWebhook,
    sourceIngestRequested,
  ],
});
