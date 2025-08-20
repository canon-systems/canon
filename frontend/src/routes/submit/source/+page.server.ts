import type { Actions } from "./$types";
import { fail } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";      // to read workflow name and version
import { startWorkflow } from "$lib/server/orkesClient"; // our tiny client from step 2

/**
 * Helper to read a text field from FormData and trim it.
 * Returns an empty string if the field is missing or not text.
 */
function text(form: FormData, key: string): string {
    const v = form.get(key);
    return typeof v === "string" ? v.trim() : "";
}

export const actions: Actions = {
    /**
     * This action runs when you press Submit on /submit/source.
     * It validates the inputs, builds a clean JSON object, then starts your Orkes workflow.
     * Finally it returns ok plus the echo and the new workflow id so the UI can show them.
     */
    default: async ({ request }) => {
        // Read the incoming form body.
        const form = await request.formData();

        // Read which source type the user chose.
        const sourceType = String(form.get("sourceType") ?? "");

        // Allow only the four types we support.
        const allowed = new Set(["github", "git_subdir", "zip", "snippet"]);
        if (!allowed.has(sourceType)) {
            return fail(400, { error: "Pick a valid source type." });
        }

        // Build the input object that we will pass to Orkes.
        const input: Record<string, unknown> = { sourceType };

        // Validate and collect fields per type.
        if (sourceType === "github") {
            const repoUrl = text(form, "repoUrl");
            const branch = text(form, "branch");
            if (!repoUrl) return fail(400, { error: "Repository URL is required." });
            if (!repoUrl.includes("github.com")) {
                return fail(400, { error: "Repository URL must be a GitHub URL." });
            }
            if (!branch) return fail(400, { error: "Branch or tag or commit is required." });
            input.repoUrl = repoUrl;
            input.branch = branch;
        }

        if (sourceType === "git_subdir") {
            const repoUrl = text(form, "repoUrl");
            const branch = text(form, "branch");
            const subdir = text(form, "subdir");
            if (!repoUrl) return fail(400, { error: "Repository URL is required." });
            if (!repoUrl.includes("github.com")) {
                return fail(400, { error: "Repository URL must be a GitHub URL." });
            }
            if (!branch) return fail(400, { error: "Branch or tag or commit is required." });
            if (!subdir) return fail(400, { error: "Subdirectory path is required." });
            input.repoUrl = repoUrl;
            input.branch = branch;
            input.subdir = subdir;
        }

        if (sourceType === "zip") {
            // We are not uploading the raw file to Orkes yet.
            // For the MVP we only echo metadata so you can see it in the UI.
            const file = form.get("zipFile");
            if (!(file instanceof File)) {
                return fail(400, { error: "Please upload a .zip file." });
            }
            const name = file.name || "";
            if (!name.toLowerCase().endsWith(".zip")) {
                return fail(400, { error: "The uploaded file must end with .zip." });
            }
            input.zipMeta = { fileName: name, size: file.size, type: file.type };
            // In a later step we will upload to your storage and pass a URL to Orkes.
        }

        if (sourceType === "snippet") {
            const snippet = text(form, "snippet");
            if (!snippet) return fail(400, { error: "Please paste a code snippet." });
            input.snippet = snippet;
        }

        // Pull workflow name and version from env. Use defaults if not set.
        const wfName = env.ORKES_WORKFLOW_NAME || "doc_intake_v1";
        const wfVersion = Number(env.ORKES_WORKFLOW_VERSION || "1");

        try {
            // Start the workflow at Orkes. This returns a new workflow execution id.
            const workflowId = await startWorkflow(wfName, wfVersion, input);

            // Return values to the page so you can see what happened.
            // ok tells the page to show the green panel.
            // echo shows exactly what we sent.
            // orkes shows the new workflow id and the workflow metadata.
            return {
                ok: true,
                echo: input,
                orkes: {
                    workflowId,
                    name: wfName,
                    version: wfVersion
                }
            };
        } catch (err: any) {
            // Convert any error into a friendly message for the user.
            const message =
                typeof err?.message === "string"
                    ? err.message
                    : "Could not start the workflow. Check your Orkes URL and keys.";
            return fail(502, { error: message });
        }
    }
};
