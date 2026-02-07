import { serve } from "inngest/next";
import { inngest, syncKnowledgeSources, reportScheduleTick, reportScheduleBootstrap, refreshJiraWebhooks } from "../../../inngest";

export const runtime = 'nodejs';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    // checkAndRunAutomations,
    syncKnowledgeSources,
    reportScheduleTick,
    reportScheduleBootstrap,
    refreshJiraWebhooks,
  ],
});
