import { defineConfig } from "@trigger.dev/sdk";
import { syncEnvVars } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  // Your project ref (you can see it on the Project settings page in the dashboard)
  project: "proj_ngweplelkgycpqjljpsv",
  maxDuration: 60,
  //The paths for your trigger folders
  dirs: ["./trigger"],
  retries: {
    //If you want to retry a task in dev mode (when using the CLI)
    enabledInDev: false,
    //the default retry settings. Used if you don't specify on a task.
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
});

// Export tasks for auto-discovery
export { pollDocsTask } from './trigger/poll-docs';
export { backfillSummariesTask } from './trigger/backfill-summaries';