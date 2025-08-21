/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE
 * - Server "action" for the /submit page.
 * - Validates form, builds workflow input, starts Orkes workflow, returns results.
 * - Also exposes a load() that reports whether required env vars are present.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Actions, PageServerLoad } from "./$types";
import { fail } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { startWorkflow } from "$lib/server/orkesClient";

/** Helper: normalize FormData.get() to a trimmed string */
function text(form: FormData, key: string): string {
    const v = form.get(key);
    return typeof v === "string" ? v.trim() : "";
}

/** Tiny parser to infer branch/subdir from a pasted GitHub /tree/<branch>/<subdir> URL */
function parseGithubTreeUrl(
    input: string
): { owner: string; repo: string; branch?: string; subdir?: string } | null {
    try {
        const u = new URL(input);
        if (u.hostname !== "github.com") return null;
        const parts = u.pathname.split("/").filter(Boolean);
        if (parts.length < 2) return null;
        const [owner, repo, maybeTree, maybeBranch, ...rest] = parts;
        if (maybeTree === "tree" && maybeBranch) {
            return {
                owner,
                repo,
                branch: maybeBranch,
                subdir: rest.length > 0 ? rest.join("/") : undefined
            };
        }
        return { owner, repo };
    } catch {
        return null;
    }
}

/** Page guard + env status panel data */
export const load: PageServerLoad = async () => {
    const status = {
        ORKES_BASE_URL: Boolean(env.ORKES_BASE_URL),
        ORKES_KEY_ID: Boolean(env.ORKES_KEY_ID),
        ORKES_KEY_SECRET: Boolean(env.ORKES_KEY_SECRET),
        ORKES_WORKFLOW_NAME: Boolean(env.ORKES_WORKFLOW_NAME),
        ORKES_WORKFLOW_VERSION: Boolean(env.ORKES_WORKFLOW_VERSION)
    };
    return {
        envStatus: {
            allPresent:
                status.ORKES_BASE_URL &&
                status.ORKES_KEY_ID &&
                status.ORKES_KEY_SECRET &&
                status.ORKES_WORKFLOW_NAME &&
                status.ORKES_WORKFLOW_VERSION,
            status
        }
    };
};

export const actions: Actions = {
    default: async ({ request }) => {
        const form = await request.formData();
        const sourceType = String(form.get("sourceType") ?? "");
        const allowed = new Set(["github", "git_subdir", "zip", "snippet"]);
        if (!allowed.has(sourceType)) return fail(400, { error: "Pick a valid source type." });

        const input: Record<string, unknown> = { sourceType };

        if (sourceType === "github") {
            const repoUrl = text(form, "repoUrl");
            let branch = text(form, "branch"); // optional (we infer if empty)

            if (!repoUrl || !repoUrl.includes("github.com")) {
                return fail(400, { error: "Repository URL must be a GitHub URL." });
            }
            if (!branch) {
                const parsed = parseGithubTreeUrl(repoUrl);
                branch = parsed?.branch || "";
            }
            if (!branch) {
                return fail(400, {
                    error: "Branch is required (or include /tree/<branch> in the URL)."
                });
            }

            input.repoUrl = repoUrl;
            input.branch = branch;
        }

        if (sourceType === "git_subdir") {
            const repoUrl = text(form, "repoUrl");
            let branch = text(form, "branch"); // optional
            let subdir = text(form, "subdir"); // optional

            if (!repoUrl || !repoUrl.includes("github.com")) {
                return fail(400, { error: "Repository URL must be a GitHub URL." });
            }
            if (!branch || !subdir) {
                const parsed = parseGithubTreeUrl(repoUrl);
                if (!branch && parsed?.branch) branch = parsed.branch;
                if (!subdir && parsed?.subdir) subdir = parsed.subdir;
            }
            if (!branch) {
                return fail(400, {
                    error: "Branch is required (or include /tree/<branch> in the URL)."
                });
            }
            if (!subdir) {
                return fail(400, {
                    error:
                        "Subdirectory is required (or include it after the branch in the URL)."
                });
            }

            input.repoUrl = repoUrl;
            input.branch = branch;
            input.subdir = subdir;
        }

        if (sourceType === "zip") {
            const file = form.get("zipFile");
            if (!(file instanceof File)) return fail(400, { error: "Please upload a .zip file." });
            const name = file.name || "";
            if (!name.toLowerCase().endsWith(".zip")) {
                return fail(400, { error: "The uploaded file must end with .zip." });
            }
            input.zipMeta = { fileName: name, size: file.size, type: file.type };
        }

        if (sourceType === "snippet") {
            const snippet = text(form, "snippet");
            if (!snippet) return fail(400, { error: "Please paste a code snippet." });
            input.snippet = snippet;
        }

        const wfName = env.ORKES_WORKFLOW_NAME || "doc_intake_v1";
        const wfVersion = Number(env.ORKES_WORKFLOW_VERSION || "1");

        try {
            const workflowId = await startWorkflow(wfName, wfVersion, input);
            return {
                ok: true,
                echo: input, // this is handy for the client to re-use exact values we sent
                orkes: { workflowId, name: wfName, version: wfVersion }
            };
        } catch (err: any) {
            const message =
                typeof err?.message === "string"
                    ? err.message
                    : "Could not start the workflow. Check your Orkes URL and keys.";
            return fail(502, { error: message });
        }
    }
};