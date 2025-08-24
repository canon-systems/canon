// src/routes/api/github/list/+server.ts
// PURPOSE:
// Return a flat list of files in a repo (optionally under a subdir) with sizes.
// This keeps your GitHub token server-side and supports nested folders.
//
// INPUT  (POST JSON):
//   { repoUrl: string, branch?: string, subdir?: string }
//
// OUTPUT (JSON):
//   { files: Array<{ path: string; size: number }> }
//
// Notes:
// - Uses GitHub "Contents API": GET /repos/{owner}/{repo}/contents/{path}?ref=branch
//   - If "path" is a directory, it returns an array of items. If it's a file, it returns one object.
// - We walk directories recursively to collect all files under `subdir`.

import type { RequestHandler } from "@sveltejs/kit";
import { GITHUB_TOKEN } from "$env/static/private";

// A tiny helper for consistent JSON responses
function jsonResponse(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json" }
    });
}

// Build Contents API URL for owner/repo/path?ref=branch
function contentsUrl(owner: string, repo: string, branch: string, path: string) {
    const encodedPath = encodeURIComponent(path).replace(/%2F/g, "/");
    const encodedRef = encodeURIComponent(branch);
    return `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodedRef}`;
}

// GET one path (file or directory listing) from GitHub
async function fetchContents(owner: string, repo: string, branch: string, path: string) {
    const headers: Record<string, string> = {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28"
    };
    if (GITHUB_TOKEN) headers.authorization = `Bearer ${GITHUB_TOKEN}`;

    const url = contentsUrl(owner, repo, branch, path);
    const r = await fetch(url, { headers });

    if (!r.ok) {
        // Bubble up a readable message (rate limit / 404 / etc.)
        const text = await r.text().catch(() => "");
        throw new Error(`GitHub ${r.status}: ${text.slice(0, 200)}`);
    }
    return r.json(); // may be an array (directory) or an object (file)
}

// Walk a directory tree and collect files
async function listAllFiles(owner: string, repo: string, branch: string, rootPath: string) {
    // We use an explicit stack to avoid deep recursion issues
    const stack: string[] = [rootPath || ""];
    const files: Array<{ path: string; size: number }> = [];

    while (stack.length) {
        const current = stack.pop()!; // a path relative to repo root
        try {
            const node = await fetchContents(owner, repo, branch, current || "");

            if (Array.isArray(node)) {
                // It's a directory listing. Each item has: type: "file" | "dir"
                for (const item of node) {
                    const itemPath = item.path as string;   // repo-relative full path
                    if (item.type === "file") {
                        files.push({ path: itemPath, size: Number(item.size || 0) });
                    } else if (item.type === "dir") {
                        stack.push(itemPath); // dive deeper
                    }
                }
            } else if (node && node.type === "file") {
                // Direct file object
                files.push({ path: node.path as string, size: Number(node.size || 0) });
            }
        } catch (e) {
            // If a folder doesn't exist or rate-limited, we skip with minimal fuss for now.
            // You can surface this to the client if you want stricter behavior.
            // console.warn("Skipping path due to error:", current, e);
        }
    }

    return files;
}

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json().catch(() => ({} as Record<string, unknown>));
        const repoUrl = String(body.repoUrl || "");
        const branch = String(body.branch || "main");
        const subdirRaw = String(body.subdir || "");

        if (!repoUrl.includes("github.com")) {
            return jsonResponse({ error: "repoUrl must be a GitHub URL" }, 400);
        }

        // Parse owner/repo from full URL like https://github.com/owner/repo
        const noProto = repoUrl.replace(/^https?:\/\//, "");
        const parts = noProto.split("/").filter(Boolean);
        const owner = parts[1];
        const repo = parts[2];

        if (!owner || !repo) {
            return jsonResponse({ error: "repoUrl missing owner or repo" }, 400);
        }

        // Clean subdir (trim leading/trailing slashes)
        const subdir = subdirRaw.replace(/^\/+|\/+$/g, "");

        // Grab all files (under subdir if given, otherwise repo root)
        const files = await listAllFiles(owner, repo, branch, subdir);

        // Return sorted for stable UI (optional)
        files.sort((a, b) => a.path.localeCompare(b.path));

        return jsonResponse({ files }, 200);
    } catch (err) {
        return jsonResponse(
            { error: "Failed to list repository files", detail: String(err) },
            500
        );
    }
};
