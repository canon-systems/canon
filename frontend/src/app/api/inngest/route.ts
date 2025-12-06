import { serve } from "inngest/next";
import { inngest, checkAndRunAutomations, runAutomation, scanAndGenerateSummaries } from "../../../inngest";

export const runtime = 'nodejs';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    checkAndRunAutomations,
    runAutomation,
    scanAndGenerateSummaries,
  ],
});
