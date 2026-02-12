import { inngest } from "../client";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ensureJiraWebhookRegistration, markJiraWebhookError } from "@/lib/server/jira/webhooks";

export const refreshJiraWebhooks = inngest.createFunction(
  {
    id: "jira-webhook-refresh",
    name: "Canon: Jira Webhook Refresh",
    retries: 1,
    concurrency: { limit: 3 },
  },
  { cron: "0 3 * * *" },
  async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return { error: "Missing Supabase env" };
    }

    const supabase = createServiceRoleClient();
    const { data: rows, error } = await supabase
      .from("oauth_connections")
      .select("connection_id, metadata")
      .eq("provider", "confluence")
      .eq("status", "active");

    if (error) {
      console.error("[jira-webhook-refresh] Failed to fetch connections", error);
      return { error: error.message };
    }

    let refreshed = 0;
    let failed = 0;

    for (const row of rows || []) {
      const metadata = row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {};
      const hasCloudId = typeof metadata.jira_cloud_id === "string" || typeof metadata.cloud_id === "string";
      if (!hasCloudId) continue;

      try {
        await ensureJiraWebhookRegistration(row.connection_id as string);
        refreshed += 1;
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        console.error("[jira-webhook-refresh] failed", row.connection_id, message);
        await markJiraWebhookError(row.connection_id as string, message);
      }
    }

    return { refreshed, failed };
  }
);
