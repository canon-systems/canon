import { serve } from "inngest/next";
import { inngest, syncKnowledgeSources } from "../../../inngest";

export const runtime = 'nodejs';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    // checkAndRunAutomations,
    syncKnowledgeSources,
  ],
});
