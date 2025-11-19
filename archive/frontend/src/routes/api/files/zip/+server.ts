// src/routes/api/files/zip/+server.ts
import type { RequestHandler } from '@sveltejs/kit';
import JSZip from 'jszip';

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json' }
    });
}

// Only allow code/text-like files. (Adds ipynb, svelte, vue, react, etc.)
const ALLOWED_TEXTY = /\.(txt|md|markdown|json|ipynb|js|mjs|cjs|ts|tsx|jsx|py|java|rb|go|rs|c|cpp|h|hpp|cs|php|sh|bash|zsh|yaml|yml|toml|ini|cfg|conf|gradle|dockerfile|makefile|html|css|scss|sass|svelte|vue|react)$/i;

export const POST: RequestHandler = async ({ request }) => {
    try {
        const form = await request.formData();
        const file = form.get('zip');
        if (!(file instanceof File)) return json({ error: 'Missing "zip" file' }, 400);

        const includeContent = String(form.get('includeContent') ?? 'false') === 'true';
        const previewChars = Number(form.get('previewChars') ?? 800) || 800;
        const maxBytes = Number(form.get('maxBytes') ?? 200000) || 200000;

        const buf = Buffer.from(await file.arrayBuffer());
        const zip = await JSZip.loadAsync(buf);

        const out: Array<{ path: string; size: number; preview: string; content?: string }> = [];

        for (const entry of Object.values(zip.files)) {
            if (entry.dir) continue; // skip folders
            const name = entry.name;

            // Skip macOS junk & hidden files
            if (name.startsWith('__MACOSX/') || name.endsWith('.DS_Store')) continue;

            // Only include allowed code/text-like files (explicit whitelist)
            if (!ALLOWED_TEXTY.test(name)) continue;

            const text = await entry.async('string');
            const size = text.length;
            const preview = text.slice(0, previewChars);
            const content = includeContent && size <= maxBytes ? text : undefined;

            out.push({ path: name, size, preview, content });
        }

        return json({ files: out }, 200);
    } catch (err) {
        return json({ error: 'Failed to read zip', detail: String(err) }, 500);
    }
};
