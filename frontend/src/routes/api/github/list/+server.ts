/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE
 * - This endpoint powers the "List files" button in your UI.
 * - It takes a POSTed JSON body with the repo URL (and optional branch/subdir),
 *   asks GitHub for the tree at that branch, and returns only "file" (blob) items.
 *
 * WHY YOU SAW: "Please provide a valid GitHub repo URL."
 * - The old version was strict and sometimes received an empty or untrimmed repoUrl.
 * - We now:
 *    1) Trim the input
 *    2) Accept either `repoUrl` OR `repo_url` (defensive)
 *    3) Validate with a regex (`/^https?:\/\/(www\.)?github\.com\//i`)
 *    4) Automatically infer branch + subdir from a pasted /tree/... URL if missing
 *
 * NOTE
 * - We rely on server helper `parseRepoUrl` to intelligently extract owner/repo
 *   and (if present) branch + subdir from the URL itself.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { RequestHandler } from "@sveltejs/kit";
import { listRepoFiles, parseRepoUrl } from "$lib/server/github";

export const POST: RequestHandler = async ({ request }) => {
    try {
        // 1) Read JSON body safely; coerce to strings; trim whitespace.
        const body = (await request.json().catch(() => null)) as any;
        const rawUrl = (body?.repoUrl ?? body?.repo_url ?? "").toString().trim();
        const rawBranch = (body?.branch ?? "").toString().trim();
        const rawSubdir = (body?.subdir ?? "").toString().trim();

        // 2) Validate the URL in a tolerant way (handles or skips www.).
        const looksLikeGithub = /^https?:\/\/(www\.)?github\.com\//i.test(rawUrl);
        if (!rawUrl || !looksLikeGithub) {
            return new Response(
                JSON.stringify({ error: "Please provide a valid GitHub repo URL." }),
                { status: 400 }
            );
        }

        // 3) If user omitted branch/subdir, try to derive them from a /tree/<branch>/<subdir> URL.
        const parsed = parseRepoUrl(rawUrl); // returns branch/subdir when URL is a "tree" URL
        const branch = rawBranch || parsed?.branch || "";
        const subdir = rawSubdir || parsed?.subdir || "";

        if (!branch) {
            return new Response(
                JSON.stringify({
                    error:
                        "Missing branch. Add it in the request or include /tree/<branch> in the URL."
                }),
                { status: 400 }
            );
        }

        // 4) Ask GitHub for the file list (server helper applies the same inference).
        const files = await listRepoFiles({ repoUrl: rawUrl, branch, subdir });

        // 5) Optional tidy filter by extension so the UI stays readable.
        const allowed = new Set([
            ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".kt", ".cs", ".cpp", ".c", ".h", ".hpp",
            ".rb", ".php", ".scala", ".swift", ".m", ".mm", ".sql", ".json", ".yml", ".yaml", ".toml", ".md", ".svelte"
        ]);
        const filtered = files.filter((f) => {
            const p = f.path.toLowerCase();
            const dot = p.lastIndexOf(".");
            if (dot < 0) return false;
            return allowed.has(p.slice(dot));
        });

        return new Response(JSON.stringify({ files: filtered }), {
            status: 200,
            headers: { "content-type": "application/json" }
        });
    } catch (err: any) {
        const msg =
            typeof err?.message === "string"
                ? err.message
                : "Server error while listing repo files.";
        return new Response(JSON.stringify({ error: msg }), { status: 500 });
    }
};