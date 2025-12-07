import { serve } from "inngest/next";
import { inngest, checkAndRunAutomations } from "../../../inngest";

export const runtime = 'nodejs';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    checkAndRunAutomations,
  ],
});
