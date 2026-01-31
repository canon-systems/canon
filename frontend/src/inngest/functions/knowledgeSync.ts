import { inngest } from "../client";
import { createClient } from "@supabase/supabase-js";
import {
  syncGitHubSourceDelta,
  syncIssueSourceDelta,
  type WorkspaceSource,
} from "@/lib/server/services/sourceIngest";

/**
 * Knowledge sync: runs every 1 minute (for testing; adjust cron as needed).
 * For each workspace source, performs delta sync of repo_file_summaries and
 * issue_index (additions, changes, deletions), then rebuilds AKUs when needed.
 */
export const syncKnowledgeSources = inngest.createFunction(
  {
    id: "knowledge-sync",
    name: "Knowledge Sync (repo_file_summaries + issue_index)",
    retries: 2,
  },
  { cron: "*/10 * * * *" }, // every 1 minute
  async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !serviceKey) {
      console.error("[knowledge-sync] Missing Supabase env");
      return { error: "Missing Supabase env" };
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: sources, error } = await supabase
      .from("workspace_sources")
      .select("id, user_id, provider, scope, connection_id")
      .in("provider", ["github", "jira", "linear", "asana"]);

    if (error) {
      console.error("[knowledge-sync] Failed to fetch sources", error);
      return { error: error.message };
    }

    if (!sources?.length) {
      console.log("[knowledge-sync] No sources to sync");
      return { synced: 0, timestamp: new Date().toISOString() };
    }

    console.log(`[knowledge-sync] Starting: ${sources.length} source(s)`);

    let githubAdded = 0;
    let githubRemoved = 0;
    let issueAdded = 0;
    let issueRemoved = 0;
    let errors: string[] = [];

    for (const row of sources as WorkspaceSource[]) {
      const provider = (row.provider || "").toLowerCase();
      const scopeLabel =
        provider === "github"
          ? (row.scope as { repo?: string })?.repo ?? row.id
          : (row.scope as { project?: string })?.project ?? row.id;
      try {
        if (provider === "github") {
          const r = await syncGitHubSourceDelta(supabase, row);
          githubAdded += r.added;
          githubRemoved += r.removed;
          if (r.added > 0 || r.removed > 0) {
            console.log(`[knowledge-sync] GitHub ${scopeLabel}: ${r.added} file(s) added, ${r.removed} removed${r.rebuilt ? ", AKUs rebuilt" : ""}`);
          }
        } else if (["jira", "linear", "asana"].includes(provider)) {
          const r = await syncIssueSourceDelta(supabase, row);
          issueAdded += r.added;
          issueRemoved += r.removed;
          if (r.added > 0 || r.removed > 0) {
            console.log(`[knowledge-sync] ${provider} ${scopeLabel}: ${r.added} issue(s) added, ${r.removed} removed${r.rebuilt ? ", AKUs rebuilt" : ""}`);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${row.id} (${provider}): ${msg}`);
        console.error(`[knowledge-sync] Failed ${provider} ${scopeLabel}: ${msg}`);
      }
    }

    console.log(
      `[knowledge-sync] Done: ${sources.length} source(s), ` +
        `GitHub +${githubAdded}/-${githubRemoved}, issues +${issueAdded}/-${issueRemoved}` +
        (errors.length ? `, ${errors.length} error(s)` : "")
    );

    return {
      synced: sources.length,
      githubAdded,
      githubRemoved,
      issueAdded,
      issueRemoved,
      errors: errors.length ? errors : undefined,
      timestamp: new Date().toISOString(),
    };
  }
);
