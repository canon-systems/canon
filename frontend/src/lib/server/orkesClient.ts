/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE OF THIS FILE
 * - This file provides a *very small* "client" for talking to your Orkes cluster
 *   *from the server only* (never from the browser).
 * - It exposes two functions:
 *     1) getToken()      -> requests a short-lived JWT from Orkes using your app key+secret
 *     2) startWorkflow() -> uses that JWT to start a workflow execution with some input
 *
 * IMPORTANT SECURITY NOTES
 * - We read secrets (Key ID and Key Secret) from SvelteKit "private" env vars.
 *   Private env vars are only accessible on the server and are never sent to the browser.
 * - We also keep a super small in-memory cache for the token so we don't request a new
 *   token on every single HTTP request (this reduces latency and load).
 * - We never, ever expose your Key Secret to the client. Only this server file knows it.
 *
 * BIG PICTURE FLOW
 * 1) A user submits a form on your page.
 * 2) Your server action builds a plain JS object (the "workflow input").
 * 3) Your server action calls startWorkflow(name, version, input).
 * 4) startWorkflow gets (or refreshes) a JWT via getToken(), then POSTs to Orkes.
 * 5) Orkes responds with a unique Workflow Execution ID (a string).
 * 6) Your server action returns that ID to the page, so you can display it / debug.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { env } from "$env/dynamic/private"; // ← server-only environment variables

// ─────────────────────────────────────────────────────────────────────────────
// 1) READ AND VALIDATE REQUIRED ENV VARS
// These must exist in `.env.local` or your deployment environment.
// If any is missing, we throw immediately so you catch misconfiguration early.
// ─────────────────────────────────────────────────────────────────────────────
const BASE = env.ORKES_BASE_URL;          // e.g. "https://developer.orkescloud.com/api"
const KEY_ID = env.ORKES_KEY_ID;          // Application "Key Id" you created in Orkes Console
const KEY_SECRET = env.ORKES_KEY_SECRET;  // Application "Key Secret" (keep private!)

if (!BASE || !KEY_ID || !KEY_SECRET) {
    // Throwing here means your app will fail to boot with a *clear* error,
    // rather than failing later with a confusing "cannot fetch token" message.
    throw new Error(
        "Missing one or more Orkes env vars. " +
        "Please set ORKES_BASE_URL, ORKES_KEY_ID, ORKES_KEY_SECRET in .env.local and restart."
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) TINY IN-MEMORY TOKEN CACHE
// Structure explanation:
// - token: the actual JWT string returned by Orkes /token
// - expMs: a timestamp (in milliseconds) when we *consider* the cached token expired
//   (we choose ~55 minutes from now to be safe; the real JWT may allow longer)
// This is sufficient for a single-node dev server. For multi-node prod, you'd
// likely use a shared cache or re-mint per request; both work fine.
// ─────────────────────────────────────────────────────────────────────────────
let tokenCache: { token: string; expMs: number } | null = null;

/**
 * getToken()
 * - IF we have a non-expired token in memory, return it immediately (fast path).
 * - ELSE call Orkes POST /token with your KeyId+KeySecret to get a fresh token.
 * - Cache the token with a conservative expiry (55 minutes from now).
 * - Return the token string to the caller.
 *
 * Why POST /token?
 * - Orkes requires you to exchange your KeyId+KeySecret for a short-lived JWT.
 * - That JWT is then sent on *every* subsequent API call via the "X-Authorization" header.
 */
async function getToken(): Promise<string> {
    const now = Date.now();

    // Fast path: we already have a not-yet-expired token → reuse it (saves ~100–300ms).
    if (tokenCache && now < tokenCache.expMs) {
        return tokenCache.token;
    }

    // Build the absolute URL to the token mint endpoint on your cluster.
    // NOTE: BASE already ends with "/api", which is required by Orkes.
    const url = `${BASE}/token`;

    // Make the request. We send a JSON body with { keyId, keySecret }.
    // Headers "accept" and "content-type" help Orkes parse and respond correctly.
    const res = await fetch(url, {
        method: "POST",
        headers: {
            accept: "application/json",
            "content-type": "application/json"
        },
        body: JSON.stringify({
            keyId: KEY_ID,
            keySecret: KEY_SECRET
        })
    });

    // If the response is not 2xx, we read the text body for clues and throw an Error.
    // Throwing bubbles up to your action, where we turn it into a nice user message.
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Orkes token request failed ${res.status}. ${text}`);
    }

    // Parse the successful JSON, which looks like: { "token": "<JWT HERE>" }
    const data = (await res.json()) as { token: string };
    const token = data.token;

    // Cache it for ~55 minutes (a safe window; tokens are short-lived).
    tokenCache = { token, expMs: now + 55 * 60 * 1000 };

    return token; // ← return the token to the caller
}

/**
 * startWorkflow(name, version, input)
 * - PURPOSE: Create a *new* workflow execution in Orkes with your chosen inputs.
 * - This calls: POST {BASE}/workflow/{name}?version=<number>
 * - HEADERS: "X-Authorization: <JWT>" (from getToken()), "content-type: application/json"
 * - BODY: your plain JSON object with input fields (whatever your workflow expects)
 * - RETURN: the new execution ID as a string (e.g., "doc_intake_v1-01JABCDEF...").
 *
 * THINK OF THIS LIKE:
 *   "Dear Orkes, please start the 'doc_intake_v1' workflow at version 1,
 *    and here's the JSON input for it to work with."
 */
export async function startWorkflow(
    name: string,
    version: number | undefined,
    input: unknown
): Promise<string> {
    // 1) Make sure we have a valid JWT.
    const jwt = await getToken();

    // 2) Build the start URL.
    //    - We URL-encode the workflow name just in case.
    //    - If a version was provided, we append it as a query parameter (?version=1).
    const url = new URL(`${BASE}/workflow/${encodeURIComponent(name)}`);
    if (typeof version === "number") {
        url.searchParams.set("version", String(version));
    }

    // 3) Execute the HTTP request to start the workflow.
    const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
            "content-type": "application/json", // tells Orkes we're sending JSON input
            "X-Authorization": jwt              // proves we authenticated with our app key
        },
        body: JSON.stringify(input)           // the actual input that your workflow will see
    });

    // 4) If not OK, include the server's response text in the error for faster debugging.
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Start workflow failed ${res.status}. ${text}`);
    }

    // 5) Orkes typically returns a JSON-encoded string (e.g., `"doc_intake_v1-01J..."`).
    //    We read as text, then strip any surrounding quotes.
    const bodyText = await res.text();
    const id = bodyText.replace(/^"|"$/g, "");

    // 6) Return the execution ID so your UI can display it and you can find the run in Orkes.
    return id;
}
