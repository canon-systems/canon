// We import SvelteKit types so TypeScript knows this is a server handler.
// This tells the editor and compiler that this file is a SvelteKit server route.
import type { RequestHandler } from "@sveltejs/kit";

// We read private env vars (these live in your .env file and DO NOT go to the browser).
// IMPORTANT: Keep your secrets private. Do not commit .env to git.
import { GITHUB_TOKEN } from "$env/static/private";

// -------------------------------
// TINY CONSTANTS & HELPERS (TOP)
// -------------------------------

// We set up default headers to talk nicely to GitHub's API. We ask for JSON.
// If we have a token, we add it to avoid strict rate limits.
const headers: Record<string, string> = {
    "accept": "application/vnd.github+json"
};
// If we have your secret token, we add it to requests (this stays on server only).
if (GITHUB_TOKEN) headers["authorization"] = `Bearer ${GITHUB_TOKEN}`;

// This is a small helper to return JSON to the browser with a status code.
// It keeps things tidy and avoids repeating Response boilerplate over and over.
function jsonResponse(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json" }
    });
}

// This turns base64 strings (what GitHub Contents API gives us for file bodies)
// back into normal readable text.
function base64ToString(b64: string): string {
    try {
        // We try to decode using Buffer so we get proper UTF-8 text out.
        return Buffer.from(b64, "base64").toString("utf8");
    } catch {
        // If something weird happens, we just coerce to a string so nothing explodes.
        return String(b64);
    }
}

// Sometimes different OS/newlines are used. This function makes newlines consistent.
// It converts Windows "\r\n" into plain "\n" so previews and sizes behave predictably.
function normalizeNewlines(s: string): string {
    return s.replace(/\r\n/g, "\n");
}

// When we only want a small preview, we carefully slice the first N characters.
// We keep this simple and friendly; no fancy grapheme logic needed for code.
function safePreview(s: string, maxChars: number): string {
    return s.slice(0, Math.max(0, maxChars | 0));
}

// Build a GitHub Contents API URL for one file path inside a repo at a branch/ref.
// Example: https://api.github.com/repos/owner/repo/contents/path?ref=branch
function contentsApiUrl(owner: string, repo: string, branch: string, repoPath: string): string {
    const encodedPath = encodeURIComponent(repoPath).replace(/%2F/g, "/");
    const encodedRef = encodeURIComponent(branch);
    return `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodedRef}`;
}

// Build the "raw" URL that serves the plain file text directly (no JSON wrapper).
// Example: https://raw.githubusercontent.com/owner/repo/branch/path
function rawUrl(owner: string, repo: string, branch: string, repoPath: string): string {
    const cleanPath = repoPath.replace(/^\/+/, "");
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${cleanPath}`;
}

// -------------------------------------
// CORE FETCH: ONE FILE, TWO STRATEGIES
// -------------------------------------
// We first try the friendly Contents API (it gives us metadata AND base64 content).
// If that doesn't include content (e.g., file is "too large"), we try the raw URL.
// We also support an OPTION to include full content (with a safety cap so we don't
// ship massive blobs to the browser).
async function fetchOneFile(
    owner: string,
    repo: string,
    branch: string,
    repoPath: string,
    previewChars: number,
    includeContent: boolean, // NEW: should we include the full text if it’s small enough?
    maxBytes: number         // NEW: hard cap so we don’t send huge payloads
) {
    // We keep the answer here. We always return path, size (in characters of text),
    // and a tiny preview. We only add "content" if includeContent=true and it’s safe.
    const result = {
        path: repoPath,                           // repo relative path like "backend/summarizer_modal.py"
        size: 0,                                  // count of characters in the decoded text
        preview: "",                              // first previewChars of the text
        content: undefined as string | undefined  // OPTIONAL: full text (capped)
    };

    // We extend our base headers with the GitHub API version ONLY for Contents API calls.
    const apiHeaders: Record<string, string> = {
        ...headers,
        "x-github-api-version": "2022-11-28"
    };

    // --------------- Try #1: Contents API (JSON with base64 "content") ---------------
    try {
        const url = contentsApiUrl(owner, repo, branch, repoPath);
        const r = await fetch(url, { headers: apiHeaders });

        if (r.ok) {
            const j = await r.json();

            // "type" === "file" and "content" present => we can decode it here!
            if (j && j.type === "file" && typeof j.content === "string") {
                // Decode base64 → utf8 string, normalize newlines for nicer previews/sizes.
                const text = normalizeNewlines(base64ToString(j.content));

                // Store size (characters) and a small preview slice.
                result.size = text.length;
                result.preview = safePreview(text, previewChars);

                // NEW: If the caller asked for full content AND it’s not too big, add it.
                // j.size is bytes, result.size is characters. We trust the decoded text length
                // to be similar in most source-code cases; for stricter control we respect maxBytes.
                if (includeContent && text.length <= maxBytes) {
                    result.content = text;
                }
                return result;
            }

            // If it’s a file but “content” is missing (GitHub omits content for big files),
            // we’ll fall through and try the raw URL next.
        }
    } catch {
        // If the Contents API call failed for any reason, we silently try raw next.
    }

    // -------------------- Try #2: Raw URL (plain text from GitHub) --------------------
    try {
        const raw = rawUrl(owner, repo, branch, repoPath);

        // We ask for "text/plain". GitHub will send text (utf-8).
        const r2 = await fetch(raw, { headers: { "accept": "text/plain" } });

        if (r2.ok) {
            // Read plain text, normalize newlines, then compute preview and size.
            const text = normalizeNewlines(await r2.text());

            result.size = text.length;
            result.preview = safePreview(text, previewChars);

            // NEW: include full content if the caller wants it and it’s within the safety cap.
            if (includeContent && text.length <= maxBytes) {
                result.content = text;
            }
            return result;
        }
    } catch {
        // If even the raw fetch failed, we just return the default (empty preview).
    }

    // If both attempts failed or there was no content, we return a safe, empty-ish object.
    return result;
}

// --------------------------------------------------
// POST HANDLER: The browser calls THIS route (POST).
// --------------------------------------------------
// The browser gives us: repoUrl, branch, subdir, selectedFiles, previewChars,
// and (optionally) includeContent + maxBytes. We fetch each file and reply.
export const POST: RequestHandler = async ({ request }) => {
    try {
        // Step 1. Parse the body (we expect JSON). If parsing fails, use an empty object.
        const body = await request.json().catch(() => ({} as Record<string, unknown>));

        // Step 2. Read inputs with gentle defaults so the page is easy to use.
        const repoUrl = String(body.repoUrl || "");                 // e.g., https://github.com/owner/repo
        const branch = String(body.branch || "main");               // which branch to read (default: main)
        const subdirRaw = String(body.subdir || "");                // optional subfolder like "backend"
        const selectedFiles = body.selectedFiles ?? [];             // list of file names/paths we want
        const includeContent = Boolean(body.includeContent);        // NEW: include full text back?
        const previewChars = Number(body.previewChars ?? 800);      // how many preview chars to keep
        const maxBytes = Number(body.maxBytes ?? 200_000);          // NEW: safety cap for full content

        // Step 3. Quick safety check: make sure repoUrl looks like a GitHub repo URL.
        // Shape should be: https://github.com/owner/repo
        if (!repoUrl.includes("github.com")) {
            return jsonResponse({ error: "repoUrl must be a GitHub URL" }, 400);
        }

        // Step 4. Pull out owner and repo from the URL (we strip protocol first).
        const noProto = repoUrl.replace(/^https?:\/\//, "");
        const parts = noProto.split("/").filter(Boolean);
        const owner = parts[1];
        const repo = parts[2];
        if (!owner || !repo) {
            return jsonResponse({ error: "repoUrl is missing owner or repo" }, 400);
        }

        // Step 5. Clean the subdir by removing extra slashes at the start/end.
        // This avoids double slashes like "backend//file.py".
        const subdir = subdirRaw.replace(/^\/+|\/+$/g, "");

        // Step 6. Normalize selectedFiles into a clean array of strings.
        // This lets the caller send a single string OR an array—they both work.
        const files: string[] = Array.isArray(selectedFiles)
            ? selectedFiles.map(String)
            : typeof selectedFiles === "string"
                ? [selectedFiles]
                : [];

        // Step 7. Build repo-relative paths.
        // If the user typed "app.py" and subdir is "backend", we produce "backend/app.py".
        const repoRelative = files.map((name) => {
            const clean = String(name).replace(/^\/+/, ""); // strip any leading slash
            if (subdir && !clean.startsWith(subdir + "/")) return `${subdir}/${clean}`;
            return clean;
        });

        // Step 8. Fetch each file in parallel so it feels snappy in the UI.
        const results = await Promise.all(
            repoRelative.map((path) =>
                fetchOneFile(owner, repo, branch, path, previewChars, includeContent, maxBytes)
            )
        );

        // Step 9. Send back what the browser needs: each file with path, size, preview,
        // and (optionally) full "content" if allowed by includeContent & maxBytes.
        return jsonResponse({ files: results }, 200);
    } catch (err) {
        // If something surprising happens (network hiccup, JSON parse oddness), we return
        // a friendly error so the UI can show a helpful message.
        return jsonResponse({ error: "Server crashed while reading files", detail: String(err) }, 500);
    }
};