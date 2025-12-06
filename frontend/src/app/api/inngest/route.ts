import { serve } from "inngest/next";
import { inngest, checkAndRunAutomations, runAutomation } from "../../../inngest";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    checkAndRunAutomations,
    runAutomation,
  ],
});
