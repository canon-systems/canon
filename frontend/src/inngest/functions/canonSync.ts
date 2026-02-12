import { inngest } from "../client";
import { createClient } from "@supabase/supabase-js";
import {
  syncGitHubSourceDelta,
  syncIssueSourceDelta,
  type WorkspaceSource,
} from "@/lib/server/services/sourceIngest";

const MAX_LOG_ITEMS = 20;

function logChangedItems(
  added: string[],
  removed: string[],
  kind: "file" | "ticket"
): void {
  if (added.length > 0) {
    const show = added.slice(0, MAX_LOG_ITEMS);
    const more = added.length > MAX_LOG_ITEMS ? ` (+${added.length - MAX_LOG_ITEMS} more)` : "";
    console.log(`[canon-sync]   ${kind}s added: ${show.join(", ")}${more}`);
  }
  if (removed.length > 0) {
    const show = removed.slice(0, MAX_LOG_ITEMS);
    const more = removed.length > MAX_LOG_ITEMS ? ` (+${removed.length - MAX_LOG_ITEMS} more)` : "";
    console.log(`[canon-sync]   ${kind}s removed: ${show.join(", ")}${more}`);
  }
}

/**
 * Canon sync: runs hourly.
 * For each workspace source, performs delta sync of repo_file_summaries and
 * issue_index (additions, changes, deletions), then rebuilds AKUs when needed.
 */
export const syncCanonSources = inngest.createFunction(
  {
    id: "canon-sync",
    name: "Canon: Source Delta Sync",
    retries: 2,
    concurrency: { limit: 3 }, // allow Jira runs in parallel with GitHub without overwhelming gateway
  },
  { cron: "0 * * * *" }, // every hour
  async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !serviceKey) {
      console.error("[canon-sync] Missing Supabase env");
      return { error: "Missing Supabase env" };
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: sources, error } = await supabase
      .from("workspace_sources")
      .select("id, user_id, provider, scope, connection_id")
      .in("provider", ["github", "jira", "linear", "asana"]);

    if (error) {
      console.error("[canon-sync] Failed to fetch sources", error);
      return { error: error.message };
    }

    if (!sources?.length) {
      console.log("[canon-sync] No sources to sync");
      return { synced: 0, timestamp: new Date().toISOString() };
    }

    console.log(`[canon-sync] Starting: ${sources.length} source(s)`);

    let githubAdded = 0;
    let githubRemoved = 0;
    let issueAdded = 0;
    let issueRemoved = 0;
    const errors: string[] = [];

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
            console.log(
              `[canon-sync] GitHub ${scopeLabel}: ${r.added} file(s) added, ${r.removed} removed${r.rebuilt ? ", AKUs rebuilt" : ""}`
            );
            logChangedItems(r.addedPaths, r.removedPaths, "file");
          }
        } else if (["jira", "linear", "asana"].includes(provider)) {
          const r = await syncIssueSourceDelta(supabase, row);
          issueAdded += r.added;
          issueRemoved += r.removed;
          if (r.added > 0 || r.removed > 0) {
            console.log(
              `[canon-sync] ${provider} ${scopeLabel}: ${r.added} issue(s) added, ${r.removed} removed${r.rebuilt ? ", AKUs rebuilt" : ""}`
            );
            logChangedItems(r.addedKeys, r.removedKeys, "ticket");
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${row.id} (${provider}): ${msg}`);
        console.error(`[canon-sync] Failed ${provider} ${scopeLabel}: ${msg}`);
      }
    }

    console.log(
      `[canon-sync] Done: ${sources.length} source(s), ` +
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
