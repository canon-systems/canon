/**
 * This file lives on the server only. It never runs in the browser.
 * Its job is simple.
 * 1. Ask Orkes for a short lived token using your application key id and secret.
 * 2. Use that token to call Start Workflow with the input we pass in.
 */

import { env } from "$env/dynamic/private"; // lets us read .env values only on the server

// Read each required environment variable. If any is missing, throw early so we notice.
const BASE = env.ORKES_BASE_URL;          // Example: https://developer.orkescloud.com/api
const KEY_ID = env.ORKES_KEY_ID;          // Your Orkes Application Key Id
const KEY_SECRET = env.ORKES_KEY_SECRET;  // Your Orkes Application Key Secret

if (!BASE || !KEY_ID || !KEY_SECRET) {
    throw new Error("Missing one or more Orkes env vars. Check ORKES_BASE_URL, ORKES_KEY_ID, ORKES_KEY_SECRET.");
}

// A tiny in memory cache for the token so we do not mint on every request.
// token holds the JWT string. expMs is a local expiry time in milliseconds since epoch.
let tokenCache: { token: string; expMs: number } | null = null;

/**
 * getToken asks Orkes for a JWT if we do not have a valid one in memory.
 * The endpoint is POST <BASE>/token with a JSON body that includes keyId and keySecret.
 * The response is JSON with a "token" field.
 */
async function getToken(): Promise<string> {
    // If we have a cached token and it is still fresh, return it.
    const now = Date.now();
    if (tokenCache && now < tokenCache.expMs) {
        return tokenCache.token;
    }

    // Build the full URL to the token endpoint.
    const url = `${BASE}/token`;

    // Call the endpoint with the right headers and body.
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

    // If the response is not ok, read the text for debugging and throw an error.
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Orkes token request failed ${res.status}. ${text}`);
    }

    // Parse the JSON and pull the token field out.
    const data = (await res.json()) as { token: string };
    const token = data.token;

    // Save the token in memory for about 55 minutes.
    // The real token has an expiry. We do not parse it here. We just keep a safe window.
    tokenCache = { token, expMs: now + 55 * 60 * 1000 };

    // Return the token to the caller.
    return token;
}

/**
 * startWorkflow calls POST /workflow/{name}?version=X
 * It sends your input JSON in the body.
 * Orkes returns the workflow execution id as a string.
 */
export async function startWorkflow(name: string, version: number | undefined, input: unknown): Promise<string> {
    // First get a valid token.
    const jwt = await getToken();

    // Build the workflow start URL.
    const url = new URL(`${BASE}/workflow/${encodeURIComponent(name)}`);
    if (typeof version === "number") {
        url.searchParams.set("version", String(version));
    }

    // Call the start endpoint with the token in header X-Authorization.
    const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "X-Authorization": jwt
        },
        body: JSON.stringify(input)
    });

    // If not ok, surface the error text to help you debug quickly.
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Start workflow failed ${res.status}. ${text}`);
    }

    // The response is usually a plain JSON string like "doc_intake_v1-01J...".
    // We read it as text and strip surrounding quotes if present.
    const bodyText = await res.text();
    return bodyText.replace(/^"|"$/g, "");
}