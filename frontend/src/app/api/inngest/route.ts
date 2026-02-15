import { serve } from "inngest/next";
import {
  inngest,
  syncCanonSources,
  reportScheduleTick,
  reportScheduleBootstrap,
  diffSourceBackfill,
  ingestJiraWebhook,
} from "../../../inngest";

export const runtime = 'nodejs';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    // checkAndRunAutomations,
    syncCanonSources,
    reportScheduleTick,
    reportScheduleBootstrap,
    diffSourceBackfill,
    ingestJiraWebhook,
  ],
});
