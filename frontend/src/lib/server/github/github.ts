/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE
 * - Server-only utilities to work with GitHub repos for *listing files*.
 * - We now support "smart parsing" of full GitHub *tree* URLs so that a single
 *   pasted URL (like .../tree/<branch>/<sub/dir>) lets us infer branch+subdir
 *   without the user typing them separately.
 *
 * WHAT'S NEW IN THIS VERSION
 * - parseRepoUrl(): now returns { owner, repo, branch?, subdir? }:
 *     • Handles:
 *        https://github.com/<owner>/<repo>
 *        https://github.com/<owner>/<repo>/tree/<branch>
 *        https://github.com/<owner>/<repo>/tree/<branch>/<sub/dir>
 * - listRepoFiles(opts): will *derive* branch/subdir from the URL *if* opts.branch
 *   or opts.subdir are missing (so UI can just send repoUrl).
 *
 * SECURITY & WHY SERVER-ONLY
 * - We keep the GitHub token (if provided) on the server only.
 * - This avoids exposing credentials to the browser and avoids CORS headaches.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// OPTIONAL: GitHub token to raise rate limits / avoid certain org restrictions.
//  - The code works without a token for public repos (under anonymous limits).
const GH_TOKEN = process.env.GITHUB_TOKEN || "";

/**
 * parseRepoUrl(input)
 * - Accepts any of:
 *     https://github.com/<owner>/<repo>
 *     https://github.com/<owner>/<repo>/tree/<branch>
 *     https://github.com/<owner>/<repo>/tree/<branch>/<sub/dir>
 * - Returns:
 *     { owner, repo, branch?: string, subdir?: string }
 * - If the URL is invalid or not github.com → returns null.
 */
export function parseRepoUrl(
    input: string
): { owner: string; repo: string; branch?: string; subdir?: string } | null {
    try {
        const u = new URL(input);
        if (u.hostname !== "github.com") return null;

        // Example path pieces:
        //   /John-Sellers/documentation-generator/tree/master/backend
        // → ["John-Sellers","documentation-generator","tree","master","backend"]
        const parts = u.pathname.split("/").filter(Boolean);
        if (parts.length < 2) return null;

        const [owner, repo, maybeTree, maybeBranch, ...rest] = parts;

        // Case 1: a /tree URL
        if (maybeTree === "tree" && maybeBranch) {
            return {
                owner,
                repo,
                branch: maybeBranch,                 // e.g., "master"
                subdir: rest.length > 0 ? rest.join("/") : undefined // e.g., "backend"
            };
        }

        // Case 2: plain owner/repo URL
        return { owner, repo };
    } catch {
        return null;
    }
}

/**
 * Small helper to GET JSON from GitHub with correct headers.
 * - Adds Authorization when a token is provided.
 */
async function ghGet<T>(url: string): Promise<T> {
    const res = await fetch(url, {
        headers: {
            accept: "application/vnd.github+json",
            ...(GH_TOKEN ? { authorization: `Bearer ${GH_TOKEN}` } : {})
        }
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`GitHub GET failed ${res.status} ${url} ${text}`);
    }
    return (await res.json()) as T;
}

/**
 * resolveBranchSha(owner, repo, branch)
 * - Maps a human branch name (e.g., "main") → its current commit SHA.
 * - Endpoint: GET /repos/{owner}/{repo}/branches/{branch}
 */
export async function resolveBranchSha(
    owner: string,
    repo: string,
    branch: string
): Promise<string> {
    type Branch = { commit: { sha: string } };
    const data = await ghGet<Branch>(
        `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`
    );
    return data.commit.sha;
}

/**
 * listTree(owner, repo, sha)
 * - Returns all file (blob) entries at a commit/tree.
 * - Endpoint: GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1
 */
export async function listTree(
    owner: string,
    repo: string,
    sha: string
): Promise<Array<{ path: string; size: number }>> {
    type TreeResp = { tree: Array<{ path: string; type: "blob" | "tree"; size?: number }> };
    const data = await ghGet<TreeResp>(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(sha)}?recursive=1`
    );
    return data.tree
        .filter((n) => n.type === "blob")
        .map((n) => ({ path: n.path, size: n.size ?? 0 }));
}

/**
 * listRepoFiles(opts)
 * - NEW: branch and subdir are now OPTIONAL because we can infer them from repoUrl.
 * - Steps:
 *    1) parse owner/repo (+ maybe branch/subdir) from the URL
 *    2) prefer explicit opts.branch/opts.subdir if caller provided them
 *    3) resolve branch → sha
 *    4) list files at that sha
 *    5) if subdir is set, filter to that prefix
 */
export async function listRepoFiles(opts: {
    repoUrl: string;
    branch?: string;     // ← optional now
    subdir?: string;     // ← optional now
}): Promise<Array<{ path: string; size: number }>> {
    // 1) Parse the URL (owner/repo are mandatory)
    const parsed = parseRepoUrl(opts.repoUrl);
    if (!parsed) throw new Error("Invalid GitHub URL");

    const owner = parsed.owner;
    const repo = parsed.repo;

    // 2) Decide which branch/subdir to use:
    //    - prefer the explicit values provided by caller
    //    - otherwise use any we can infer from the URL
    const branch = (opts.branch && opts.branch.trim()) || parsed.branch || "";
    const subdir = (opts.subdir && opts.subdir.trim()) || parsed.subdir || "";

    if (!branch) {
        // We cannot list a tree without a branch (to get the tip SHA).
        throw new Error(
            "Missing branch. Provide it explicitly or include /tree/<branch> in the GitHub URL."
        );
    }

    // 3) Resolve branch to SHA, then list the tree
    const sha = await resolveBranchSha(owner, repo, branch);
    const files = await listTree(owner, repo, sha);

    // 4) If a subdir is set, filter to that directory prefix
    if (subdir) {
        const prefix = subdir.replace(/^\/+/, ""); // normalize leading slash
        return files.filter((f) => f.path === prefix || f.path.startsWith(prefix + "/"));
    }

    // 5) Otherwise return all files
    return files;
}
