// PURPOSE:
// This server-only route takes raw code texts and builds a friendly Markdown draft.
// It does NOT use an LLM—just simple patterns—so you can test everything locally.
// The browser POSTs here with { projectName?, files:[{path, content}] }.
// We reply with JSON: { markdown }.
// On errors, we still reply with JSON (never HTML), so the client can parse safely.

import type { RequestHandler } from "@sveltejs/kit"; // tells TypeScript this is a server handler

// jsonResponse(): tiny helper that always returns JSON with the given status code.
function jsonResponse(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json" } // content-type tells the browser it’s JSON
    });
}

// pickIntroSnippet(): tries to find a “nice first paragraph” for a file.
// Strategy:
//   1) Python triple-quoted docstrings near the top ("""...""" or '''...'''),
//   2) a block of top-of-file comments (# or // or /* */),
//   3) fallback: first few non-empty lines.
function pickIntroSnippet(path: string, content: string): string {
    if (!content) return ""; // if file empty/missing, nothing to pick

    // Try Python-style docstrings first (often used to describe the module).
    const pyDoc = content.match(/"""([\s\S]{10,}?)"""|'''([\s\S]{10,}?)'''/);
    if (pyDoc) return (pyDoc[1] || pyDoc[2] || "").trim().slice(0, 400);

    // Grab the top portion (first ~80 lines) and search for comment blocks.
    const top = content.split(/\r?\n/).slice(0, 80).join("\n");

    // Look for:
    //  - multiple Python comment lines (# ...),
    //  - multiple JS/TS comment lines (// ...),
    //  - one JS/TS block comment (/* ... */).
    const block =
        top.match(/(^\s*#.+\n?)+/m) ||
        top.match(/(^\s*\/\/.+\n?)+/m) ||
        top.match(/(^\s*\/\*[\s\S]*?\*\/)/m);

    if (block) return String(block[0]).trim().slice(0, 400);

    // Fallback: first three non-empty lines (works okay for minimal files).
    const first = content
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .slice(0, 3)
        .join("\n");

    return first.slice(0, 400);
}

// findComponents(): quick “heads-up list” of notable items inside a file.
// We detect names of functions/classes in Python and JS/TS, plus a hint if
// it looks like there are FastAPI routes or frontend /api calls.
function findComponents(content: string): string[] {
    if (!content) return [];
    const items = new Set<string>(); // use a Set to avoid duplicates

    // Python functions: lines like "def my_func("
    (content.match(/^\s*def\s+([a-zA-Z_]\w*)\s*\(/gm) || []).forEach((m) => {
        items.add(`Function: ${m.replace(/^\s*def\s+/, "").replace(/\(.+$/, "")}`);
    });

    // Python classes: lines like "class MyClass:"
    (content.match(/^\s*class\s+([a-zA-Z_]\w*)\s*[:\(]/gm) || []).forEach((m) => {
        items.add(`Class: ${m.replace(/^\s*class\s+/, "").replace(/[:\(].+$/, "")}`);
    });

    // JS/TS functions: lines like "function myFunc("
    (content.match(/^\s*function\s+([a-zA-Z_]\w*)\s*\(/gm) || []).forEach((m) => {
        items.add(`Function: ${m.replace(/^\s*function\s+/, "").replace(/\(.+$/, "")}`);
    });

    // JS/TS classes: lines like "class MyClass {"
    (content.match(/^\s*class\s+([a-zA-Z_]\w*)\s*[{\(]/gm) || []).forEach((m) => {
        items.add(`Class: ${m.replace(/^\s*class\s+/, "").replace(/[{\(].+$/, "")}`);
    });

    // Very gentle web API sniffers:
    if (/fastapi|APIRouter|@app\.(get|post|put|delete)/i.test(content)) {
        items.add("Web API: FastAPI routes");
    }
    if (/fetch\(['"]\/api\//i.test(content)) {
        items.add("Web API: Frontend calls /api/*");
    }

    // Return up to 20 items for brevity.
    return Array.from(items).slice(0, 20);
}

// buildMarkdown(): turns an array of { path, content } into a single Markdown document.
// This is simple, deterministic, and runs locally without any LLM.
function buildMarkdown(
    projectName: string,
    files: Array<{ path: string; content: string }>
) {
    const title = projectName || "Project Documentation (Draft)";

    // Build a “section” for each file with an intro and a short list of discovered components.
    const perFile = files
        .map((f) => {
            const intro = pickIntroSnippet(f.path, f.content);
            const comps = findComponents(f.content);
            return [
                `### ${f.path}`, // subheading with file path
                intro
                    ? `**What it seems to do:**\n\n${intro}`
                    : "_No clear intro comment found._",
                comps.length
                    ? `**Key pieces inside:**\n\n- ${comps.join("\n- ")}`
                    : ""
            ]
                .filter(Boolean) // drop any empty strings
                .join("\n\n");   // double newlines for readable spacing
        })
        .join("\n\n");       // extra spacing between files

    // Wrap it in a gentle template that non-technical readers can follow.
    return `# ${title}

> **Purpose (guess):** Turn code files into simple summaries that explain what they do.

## What problem does it solve?
- People need to understand software without reading code line-by-line.
- This tool produces a gentle first draft of documentation from code files.

---

## File-by-file overview
${perFile}

---

> _Automatic first draft. Edit to match your team's voice and add screenshots where helpful._`;
}

// Optional GET: a tiny health check so you can hit this route in a browser.
// Example: http://localhost:5173/api/docs/generate?health=1
export const GET: RequestHandler = async ({ url }) => {
    // If you pass ?health=1 we reply with a tiny OK blob; otherwise a short help message.
    if (url.searchParams.get("health")) {
        return jsonResponse(
            { ok: true, route: "/api/docs/generate", method: "GET" },
            200
        );
    }
    return jsonResponse(
        { info: "POST { projectName?: string, files: [{ path: string, content: string }] } to get { markdown }" },
        200
    );
};

// POST handler: the main entry point used by the page button.
// Reads JSON body, normalizes it, builds markdown, returns JSON.
export const POST: RequestHandler = async ({ request }) => {
    try {
        // Read request body; if parsing fails, use {} (safe fallback).
        const body = await request.json().catch(() => ({} as any));

        // Pull the project name (optional) and the incoming files (should be an array).
        const projectName = String(body.projectName || "");
        const filesIn = Array.isArray(body.files) ? body.files : [];

        // Normalize each item to ensure we have { path: string, content: string }.
        const files = filesIn
            .filter((f: any) => f && typeof f.path === "string")
            .map((f: any) => ({
                path: String(f.path),
                content: typeof f.content === "string" ? f.content : ""
            }));

        // Build the actual markdown draft using our helper.
        const markdown = buildMarkdown(projectName, files);

        // Success: send JSON with the markdown (status 200).
        return jsonResponse({ markdown }, 200);
    } catch (err) {
        // If something unexpected happens, we STILL return JSON so the client never sees HTML.
        return jsonResponse(
            { error: "Could not generate documentation", detail: String(err) },
            500
        );
    }
};
