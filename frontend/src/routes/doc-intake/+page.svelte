<script lang="ts">
	// ------------------------------------------------------------
	// THIS <script> TAG HOLDS ALL THE PAGE LOGIC (TypeScript).
	// Super-detailed comments are included to explain every step.
	// ------------------------------------------------------------

	// We import the browser-safe Supabase client we created at:
	//   src/lib/supabaseClient.ts
	// This uses PUBLIC_ env vars and is safe in the browser.
	import { supabase } from '$lib/supabaseClient';

	// -------------------------------
	// SECTION 1: UI STATE / VARIABLES
	// -------------------------------

	// repoUrl: which GitHub repo we want to read from.
	// It should look like: https://github.com/<owner>/<repo>
	let repoUrl = 'https://github.com/John-Sellers/documentation-generator';

	// branch: which Git branch to use (your repo currently uses "master").
	let branch = 'master';

	// subdir: optional subfolder inside the repo. If set, it will prefix short filenames.
	// Example: "backend" → "backend/summarizer_modal.py"
	let subdir = 'backend';

	// filesText: users can paste/enter one filename per line here.
	// We will split this string into an array of filenames later.
	let filesText = 'summarizer_modal.py\nrequirements.txt';

	// includeContent: when true, we ask the server to return full content for each file,
	// capped by "maxBytes". When false, we only show previews to keep payloads small.
	let includeContent = true;

	// maxBytes: the maximum number of characters/bytes we allow per file when including full content.
	// This prevents giant files from overloading the browser.
	let maxBytes = 200_000; // ≈200 KB

	// results: the array of file info returned by /api/github/batchRaw.
	// Each item looks like: { path, size, preview, content? }
	// "content" is optional and present only when includeContent=true and file is under the cap.
	type FileResult = { path: string; size: number; preview: string; content?: string };
	let results: FileResult[] = [];

	// generatedMarkdown: the final documentation draft returned by /api/docs/generate.
	// We render it on the page and offer a "Download .md" button.
	let generatedMarkdown = '';

	// docTitle: a friendly title for the generated documentation.
	// We also use this as the default filename when downloading.
	let docTitle = 'Documentation Draft';

	// Type describing rows in the "doc_outputs" table (Supabase).
	// This lets TypeScript help us when reading saved docs.
	type DocRow = {
		id: string;
		created_at: string;
		title: string;
		markdown: string;
		repo_url: string | null;
		branch: string | null;
		subdir: string | null;
		selected_files: string[] | null;
	};

	// recentDocs: we fill this when you click "Load recent docs".
	let recentDocs: DocRow[] = [];

	// loading: flips to true while we are doing fetches or DB work,
	// so we can disable buttons and show "Working..." text.
	let loading = false;

	// errorMsg: a friendly error string we show near the top when something fails.
	let errorMsg = '';

	// ---------------------------------------------------
	// SECTION 2: SMALL HELPERS
	// ---------------------------------------------------

	// parseFiles(): break the textarea into clean filenames.
	// Steps:
	//   1) split by newline,
	//   2) trim spaces,
	//   3) drop empty lines.
	function parseFiles(): string[] {
		return filesText
			.split('\n')
			.map((s) => s.trim())
			.filter(Boolean);
	}

	// ---------------------------------------------------
	// SECTION 3: TALK TO /api/github/batchRaw  (FETCH FILES)
	// ---------------------------------------------------
	// This sends repo/branch/subdir and filenames to our local server route,
	// which talks to GitHub server-to-server (keeps your token private).
	// It returns previews and (optionally) full content for each file.
	async function fetchPreviews() {
		loading = true; // turn on spinner/disable buttons
		errorMsg = ''; // clear previous errors
		results = []; // clear old results so it's obvious we are reloading
		generatedMarkdown = ''; // clear generated doc so the user knows this is a new run

		try {
			// The exact JSON shape expected by /api/github/batchRaw
			const body = {
				repoUrl, // full repo URL like "https://github.com/owner/repo"
				branch, // which branch to read
				subdir, // optional subfolder prefix for short filenames
				selectedFiles: parseFiles(), // filenames array from textarea
				previewChars: 800, // the number of characters we keep for "preview"
				includeContent, // whether to include full content (capped)
				maxBytes // the cap for "content"
			};

			// Call our local server route. This keeps tokens/magic on the server only.
			const r = await fetch('/api/github/batchRaw', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});

			// Parse the JSON it returns (or a helpful error object).
			const data = await r.json();

			// If the HTTP status code is not OK (>=400), show error message and bail out.
			if (!r.ok) {
				errorMsg = data?.error || `Server said ${r.status}`;
				return;
			}

			// Success path: store the files to render on the page.
			results = Array.isArray(data.files) ? (data.files as FileResult[]) : [];
		} catch (e) {
			// Network or parse failures end up here. Show a friendly error.
			errorMsg = String(e);
		} finally {
			// Always turn off the spinner/enable buttons even if there was an error.
			loading = false;
		}
	}

	// ---------------------------------------------------
	// SECTION 4: TALK TO /api/docs/generate (BUILD MARKDOWN)
	// ---------------------------------------------------
	// Sends the list of { path, content } to a local route that creates a
	// human-friendly Markdown draft. No LLM involved—runs offline locally.
	async function generateDocs() {
		loading = true; // turn on spinner
		errorMsg = ''; // clear errors
		generatedMarkdown = ''; // clear any old doc

		try {
			// We only need path + content for the generator route.
			// If content wasn't included (includeContent=false), we'll send empty strings.
			const filesForDoc = results.map((f) => ({
				path: f.path,
				content: f.content || ''
			}));

			// Call the local generator route. It returns { markdown } on success.
			const r = await fetch('/api/docs/generate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					projectName: docTitle || 'Documentation Draft',
					files: filesForDoc
				})
			});

			// Read as TEXT first, so if the server ever sent HTML, we can show a helpful message.
			const text = await r.text();

			// Try to parse as JSON. If that fails, we likely received HTML/plain-text.
			let data: any;
			try {
				data = JSON.parse(text);
			} catch {
				errorMsg =
					`Expected JSON but got non-JSON (status ${r.status}). First bytes:\n` +
					text.slice(0, 200);
				return;
			}

			// If the HTTP status indicates an error, surface the server's error field (if present).
			if (!r.ok) {
				errorMsg = data?.error || `Generate said ${r.status}`;
				return;
			}

			// Happy path: show the Markdown so users can read, copy, or download it.
			generatedMarkdown = String(data.markdown || '');
		} catch (e) {
			errorMsg = String(e);
		} finally {
			loading = false;
		}
	}

	// ---------------------------------------------------
	// SECTION 5: SAVE TO SUPABASE (doc_outputs table)
	// ---------------------------------------------------
	// Push the current generatedMarkdown into your Supabase table for later retrieval.
	async function saveDoc() {
		// Guardrail: don't try to save an empty doc.
		if (!generatedMarkdown) {
			alert('Generate the document first.');
			return;
		}

		loading = true;
		errorMsg = '';

		try {
			// Insert one row. If there’s an RLS/policy error, Supabase returns { error }.
			const { error } = await supabase.from('doc_outputs').insert({
				title: docTitle || 'Untitled',
				repo_url: repoUrl,
				branch,
				subdir,
				selected_files: parseFiles(),
				markdown: generatedMarkdown
			});

			if (error) {
				errorMsg = error.message;
				return;
			}

			// Friendly confirmation to show the user something good happened.
			alert('Saved to Supabase ✅');
		} catch (e) {
			errorMsg = String(e);
		} finally {
			loading = false;
		}
	}

	// ---------------------------------------------------
	// SECTION 6: LOAD RECENT DOCS FROM SUPABASE
	// ---------------------------------------------------
	// Read the last 10 saved documents and display them as a clickable list.
	async function loadRecentDocs(limit = 10) {
		loading = true;
		errorMsg = '';

		try {
			const { data, error } = await supabase
				.from('doc_outputs')
				.select('id, created_at, title, markdown, repo_url, branch, subdir, selected_files')
				.order('created_at', { ascending: false })
				.limit(limit);

			if (error) {
				errorMsg = error.message;
				return;
			}

			recentDocs = Array.isArray(data) ? (data as DocRow[]) : [];

			if (!recentDocs.length) {
				alert('No saved docs yet.');
			}
		} catch (e) {
			errorMsg = String(e);
		} finally {
			loading = false;
		}
	}

	// ---------------------------------------------------
	// SECTION 7: OPEN ONE SAVED DOC INTO THE VIEWER
	// ---------------------------------------------------
	// When the user clicks a saved doc, fill the viewer and optionally repopulate inputs.
	function openDoc(doc: DocRow) {
		generatedMarkdown = doc.markdown || '';
		docTitle = doc.title || 'Documentation Draft';

		// Optionally repopulate inputs so the user can re-run with the same settings.
		if (doc.repo_url) repoUrl = doc.repo_url;
		if (doc.branch) branch = doc.branch;
		if (doc.subdir) subdir = doc.subdir;
		if (Array.isArray(doc.selected_files)) filesText = doc.selected_files.join('\n');

		// Scroll to the top so they immediately see the content.
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	// ---------------------------------------------------
	// SECTION 8: DOWNLOAD THE MARKDOWN LOCALLY
	// ---------------------------------------------------
	// Convert the markdown string to a Blob and trigger a download in the browser.
	function downloadMarkdown() {
		const blob = new Blob([generatedMarkdown || ''], {
			type: 'text/markdown;charset=utf-8'
		});
		const url = URL.createObjectURL(blob);

		const a = document.createElement('a');
		a.href = url;
		a.download = (docTitle || 'documentation_draft') + '.md';
		document.body.appendChild(a);
		a.click();
		a.remove();

		URL.revokeObjectURL(url);
	}

	// ---------------------------------------------------
	// SECTION 9: FILE PICKER (BROWSE GITHUB REPO)
	// ---------------------------------------------------
	// A small "modal" UI to browse files under `subdir` and tick checkboxes,
	// so users don't have to manually type filenames.

	// pickerOpen: whether the modal is visible or not.
	let pickerOpen = false;

	// pickerFiles: filled by the /api/github/list route, which lists repo files.
	let pickerFiles: Array<{ path: string; size: number }> = [];

	// selectedPaths: a Set of paths the user has checked in the list.
	let selectedPaths = new Set<string>();

	// togglePick(): add/remove a path from the selected set when a checkbox is clicked.
	function togglePick(path: string) {
		if (selectedPaths.has(path)) selectedPaths.delete(path);
		else selectedPaths.add(path);
	}

	// browseFiles(): call our local /api/github/list to get files under subdir.
	async function browseFiles() {
		errorMsg = '';
		pickerFiles = [];
		selectedPaths.clear();

		try {
			const r = await fetch('/api/github/list', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ repoUrl, branch, subdir })
			});

			const data = await r.json();
			if (!r.ok) {
				errorMsg = data?.error || `List said ${r.status}`;
				return;
			}

			pickerFiles = Array.isArray(data.files) ? data.files : [];
			pickerOpen = true; // open the modal
		} catch (e) {
			errorMsg = String(e);
		}
	}

	// Select all visible files in the modal (for convenience).
	function pickAll() {
		selectedPaths = new Set(pickerFiles.map((f) => f.path));
	}

	// Clear all selections in the modal.
	function clearAll() {
		selectedPaths.clear();
	}

	// Put the selected file paths into the textarea (one per line) and close the modal.
	function useSelected() {
		if (!selectedPaths.size) {
			alert('Pick at least one file.');
			return;
		}
		filesText = Array.from(selectedPaths).join('\n');
		pickerOpen = false;
	}
</script>

<!--
  --------------------------------------------------------
  BELOW IS THE MARKUP (HTML + Svelte bindings and logic).
  Each section is commented to explain what it shows/does.
  --------------------------------------------------------
-->

<!-- Outer container with padding and vertical spacing between sections -->
<div class="space-y-4 p-4">
	<!-- Page title -->
	<h1 class="text-xl font-bold">Doc Intake → Generate → Save (local)</h1>

	<!-- Document title input (used for the generated doc and download filename) -->
	<label class="block">
		<div class="font-semibold">Document title</div>
		<input class="w-full border p-2" bind:value={docTitle} />
	</label>

	<!-- Grid of inputs: repo URL, branch, subfolder, filenames -->
	<div class="grid gap-3 md:grid-cols-2">
		<!-- Repo URL -->
		<label class="block">
			<div class="font-semibold">GitHub repo URL</div>
			<input class="w-full border p-2" bind:value={repoUrl} />
		</label>

		<!-- Branch -->
		<label class="block">
			<div class="font-semibold">Branch</div>
			<input class="w-full border p-2" bind:value={branch} />
		</label>

		<!-- Subfolder -->
		<label class="block">
			<div class="font-semibold">Subfolder inside repo</div>
			<input class="w-full border p-2" bind:value={subdir} />
		</label>

		<!-- Filenames textarea (one per line) -->
		<label class="block md:col-span-2">
			<div class="font-semibold">File names, one per line</div>
			<textarea class="h-28 w-full border p-2" bind:value={filesText}></textarea>
		</label>
	</div>

	<!-- Options row: include full content + safety cap field -->
	<div class="flex items-center gap-4">
		<label class="flex items-center gap-2">
			<input type="checkbox" bind:checked={includeContent} />
			<span>Include full content (respect cap)</span>
		</label>

		<label class="flex items-center gap-2">
			<span>Cap (bytes/chars per file):</span>
			<input type="number" class="w-28 border p-1" bind:value={maxBytes} min="50000" step="10000" />
		</label>
	</div>

	<!-- Buttons row: browse → fetch → generate → download → save → load -->
	<div class="flex flex-wrap gap-2">
		<!-- Browse the repo and pick files via checkboxes -->
		<button
			class="rounded border px-3 py-2"
			on:click|preventDefault={browseFiles}
			disabled={loading}
		>
			Browse files (GitHub)
		</button>

		<!-- Fetch file previews (and optional content) -->
		<button
			class="rounded border px-3 py-2"
			on:click|preventDefault={fetchPreviews}
			disabled={loading}
		>
			{loading ? 'Working...' : '1) Fetch files'}
		</button>

		<!-- Generate the documentation draft from the files -->
		<button
			class="rounded border px-3 py-2"
			on:click|preventDefault={generateDocs}
			disabled={loading || !results.length}
			title={!results.length ? 'Fetch files first' : ''}
		>
			2) Generate documentation
		</button>

		<!-- Download the generated markdown as a .md file -->
		<button
			class="rounded border px-3 py-2"
			on:click|preventDefault={downloadMarkdown}
			disabled={!generatedMarkdown}
			title={!generatedMarkdown ? 'Generate docs first' : ''}
		>
			3) Download .md
		</button>

		<!-- Save the document to Supabase (doc_outputs table) -->
		<button
			class="rounded border px-3 py-2"
			on:click|preventDefault={saveDoc}
			disabled={!generatedMarkdown}
			title={!generatedMarkdown ? 'Generate docs first' : ''}
		>
			4) Save to Supabase
		</button>

		<!-- Load recent saved docs from Supabase and show them in a list -->
		<button
			class="rounded border px-3 py-2"
			on:click|preventDefault={() => loadRecentDocs(10)}
			disabled={loading}
		>
			5) Load recent docs
		</button>
	</div>

	<!-- Error box: only appears if errorMsg is non-empty -->
	{#if errorMsg}
		<div class="text-red-600">{errorMsg}</div>
	{/if}

	<!-- Results: one “card” per fetched file -->
	{#if results.length}
		<div class="space-y-4">
			{#each results as f}
				<div class="rounded border p-3">
					<div class="font-semibold">{f.path} • {f.size} chars</div>
					<pre class="mt-2 whitespace-pre-wrap text-sm">{f.preview}</pre>

					{#if f.content}
						<details class="mt-2">
							<summary class="cursor-pointer text-sm underline">Full content (capped)</summary>
							<pre class="mt-2 whitespace-pre-wrap text-xs">{f.content}</pre>
						</details>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Saved docs list: appears after clicking “Load recent docs” -->
	{#if recentDocs.length}
		<div class="rounded border p-3">
			<div class="mb-2 font-semibold">Recent saved docs</div>
			<ul class="list-disc pl-5">
				{#each recentDocs as d}
					<li class="mb-1">
						<button class="underline" on:click={() => openDoc(d)}>
							{new Date(d.created_at).toLocaleString()} — {d.title}
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<!-- Markdown viewer: shows the generated or loaded markdown -->
	{#if generatedMarkdown}
		<div class="rounded border p-3">
			<div class="mb-2 font-semibold">Documentation draft</div>
			<pre class="whitespace-pre-wrap text-sm">{generatedMarkdown}</pre>
		</div>
	{/if}

	<!-- ------------------------------ -->
	<!-- SIMPLE FILE-PICKER MODAL (UI)  -->
	<!-- ------------------------------ -->
	{#if pickerOpen}
		<!-- dimmed backdrop -->
		<div class="fixed inset-0 z-10 bg-black/40"></div>

		<!-- centered panel -->
		<div class="fixed inset-0 z-20 flex items-center justify-center p-4">
			<div class="w-full max-w-3xl rounded border bg-white p-4 shadow">
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-lg font-semibold">Pick files from GitHub</h2>
					<button class="text-sm underline" on:click={() => (pickerOpen = false)}>Close</button>
				</div>

				<!-- select-all / clear-all controls -->
				<div class="mb-2 flex items-center gap-2">
					<button class="rounded border px-2 py-1 text-sm" on:click={pickAll}>Select all</button>
					<button class="rounded border px-2 py-1 text-sm" on:click={clearAll}>Clear</button>
					<div class="text-sm opacity-70">({pickerFiles.length} files)</div>
				</div>

				<!-- scrollable list of files with checkboxes -->
				<div class="max-h-80 overflow-auto rounded border">
					{#if pickerFiles.length}
						<ul>
							{#each pickerFiles as f}
								<li class="flex items-center gap-2 border-b p-2">
									<input
										type="checkbox"
										checked={selectedPaths.has(f.path)}
										on:change={() => togglePick(f.path)}
									/>
									<span class="font-mono text-sm">{f.path}</span>
									<span class="ml-auto text-xs opacity-60">{f.size} bytes</span>
								</li>
							{/each}
						</ul>
					{:else}
						<div class="p-4 text-sm opacity-70">No files found in this folder.</div>
					{/if}
				</div>

				<!-- apply selection -->
				<div class="mt-3 flex justify-end">
					<button class="rounded border px-3 py-2" on:click={useSelected}>
						Use selected files
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
