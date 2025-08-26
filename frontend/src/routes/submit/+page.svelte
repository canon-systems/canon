<script lang="ts">
	// ------------------------------------------------------------
	// /submit — Streamlined intake → summarize → save
	// Only necessary changes:
	//   - Do NOT preselect all files when loading Git files
	//   - "Clear" now truly deselects everything (reactive Set reassign)
	//   - Hide the "Load files" button once files are loaded
	//   - Reset file list when repoUrl/branch/subdir/method changes (so lists don't carry over)
	//   - Redirect to /edit/{id} after successful analyze+save
	// RLS NOTE (important):
	//   Our table has created_by defaulting to auth.uid().
	//   Policies only allow a user to read/update/delete rows where
	//   created_by = auth.uid(). We never set created_by in the client.
	//   Postgres fills it in. This guarantees the row belongs to the
	//   current user and prevents cross-user access.
	// ------------------------------------------------------------

	import { supabase } from '$lib/supabaseClient';
	import { Github, FolderOpen, Upload, Code, Loader2 } from '@lucide/svelte';

	type InputType = 'github_repo' | 'github_repo_directory' | 'zipped_folder' | 'pasted_code';
	type Status = 'completed' | 'failed' | 'processing';

	// ---------------- UI STATE ----------------
	let method: InputType = 'github_repo_directory';

	// Git inputs
	let repoUrl = 'https://github.com/John-Sellers/documentation-generator';
	let branch = 'master';
	let subdir = 'backend';

	// Zip & Paste inputs
	let zipFile: File | null = null;
	let pasteFilename = 'snippet.txt';
	let pasteCode = '';

	// Doc title (saved with the record)
	let docTitle = 'Documentation Draft';

	// Progress + errors
	let listing = false; // when loading Git file list
	let running = false; // when orchestrating analyze → save
	let errorMsg = '';
	let statusMsg = ''; // small status line while running

	// Git file picker data
	let pickerFiles: Array<{ path: string; size: number }> = [];
	let selectedPaths = new Set<string>();

	function getMethodIcon(m: InputType) {
		switch (m) {
			case 'github_repo':
				return Github;
			case 'github_repo_directory':
				return FolderOpen;
			case 'zipped_folder':
				return Upload;
			case 'pasted_code':
				return Code;
		}
	}

	// ---------------- HELPERS ----------------

	// IMPORTANT: In Svelte, mutating a Set in place (e.g., .clear()) will not trigger reactivity.
	// To notify the UI, always assign a new Set instance.
	function selectAll() {
		// assign a new Set so checkboxes react immediately
		selectedPaths = new Set(pickerFiles.map((f) => f.path));
	}
	function clearAll() {
		// assign a brand new Set (not .clear()) for reactivity
		selectedPaths = new Set();
	}
	function togglePick(path: string) {
		// clone -> mutate -> reassign (reactive)
		const next = new Set(selectedPaths);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		selectedPaths = next;
	}
	function selectedArray(): string[] {
		return Array.from(selectedPaths);
	}

	// --------- REACT to Git input changes (reset lists) ----------
	// Is current method a Git method?
	$: isGit = method === 'github_repo' || method === 'github_repo_directory';

	// A key that changes whenever relevant Git params change
	$: gitKey = isGit
		? `${method}|${repoUrl}|${branch}|${method === 'github_repo_directory' ? subdir : ''}`
		: '';

	// When leaving Git methods altogether, wipe lists
	$: if (!isGit) {
		pickerFiles = [];
		selectedPaths = new Set();
	}

	// When any Git input changes (repo/branch/subdir/method), wipe lists
	$: if (isGit && gitKey) {
		// This runs whenever gitKey changes (Svelte tracks the dependency).
		pickerFiles = [];
		selectedPaths = new Set();
	}

	// Whether to show the "Load files" button:
	// - Only for Git methods
	// - Only when files are not loaded yet
	// - Not while we are listing
	$: showLoadButton = isGit && !pickerFiles.length && !listing;

	// --------- List files for Git methods ----------
	async function listGitFiles() {
		if (!isGit) return;

		errorMsg = '';
		listing = true;
		pickerFiles = [];
		selectedPaths = new Set(); // ensure fresh state

		try {
			const r = await fetch('/api/github/list', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					repoUrl,
					branch,
					subdir: method === 'github_repo_directory' ? subdir : ''
				})
			});
			const data = await r.json().catch(() => ({}));
			if (!r.ok) throw new Error(data?.error || `Git list failed (${r.status})`);

			pickerFiles = Array.isArray(data.files) ? data.files : [];

			// We intentionally do NOT preselect files.
		} catch (e) {
			errorMsg = String(e);
		} finally {
			listing = false;
		}
	}

	// Build a friendly input_content string for logging
	function buildInputContent(): string {
		if (method === 'pasted_code') return `${pasteFilename} (pasted)`;
		if (method === 'zipped_folder') return zipFile ? zipFile.name : '(no zip selected)';

		// Git
		const files = selectedArray();
		return [
			repoUrl || '',
			branch ? `@${branch}` : '',
			method === 'github_repo_directory' && subdir ? `/${subdir}` : '',
			files.length ? ` • files: ${files.slice(0, 6).join(', ')}${files.length > 6 ? '…' : ''}` : ''
		].join('');
	}

	// ---------------- MAIN CTA: ANALYZE & SAVE ----------------
	async function analyzeAndSave() {
		errorMsg = '';
		statusMsg = '';
		running = true;

		let submissionId: string | null = null;

		try {
			// 1) Log "processing"
			statusMsg = 'Queuing…';
			const filesForLog =
				method === 'pasted_code'
					? [pasteFilename]
					: method === 'zipped_folder'
						? []
						: selectedArray(); // zip names are captured in source_meta

			const source_meta =
				method === 'pasted_code'
					? { filename: pasteFilename }
					: method === 'zipped_folder'
						? { zip_name: zipFile?.name ?? null }
						: { repoUrl, branch, ...(method === 'github_repo_directory' ? { subdir } : {}) };

			// ------------------------------------------------------------
			// RLS ENFORCEMENT (important)
			// We do NOT send created_by. Postgres fills created_by = auth.uid().
			// Our policy allows INSERT only when created_by = auth.uid().
			// This guarantees the new row belongs to the current user.
			// ------------------------------------------------------------
			{
				const { data, error } = await supabase
					.from('submissions')
					.insert({
						input_type: method,
						input_content: buildInputContent(),
						status: 'processing' as Status,
						selected_files: filesForLog,
						source_meta
					})
					.select('id')
					.single();

				if (error) throw new Error(error.message);
				submissionId = (data as { id: string }).id ?? null;

				// tiny guard so we fail early if something odd happened
				if (!submissionId) throw new Error('Insert did not return a submission id.');
			}

			// 2) Gather files/content for LLM
			statusMsg = 'Collecting source files…';
			let filesForDoc: Array<{ path: string; content: string }> = [];

			if (isGit) {
				const chosen = selectedArray();
				if (!chosen.length) throw new Error('Pick at least one file.');
				const r = await fetch('/api/github/batchRaw', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						repoUrl,
						branch,
						subdir: method === 'github_repo_directory' ? subdir : '',
						selectedFiles: chosen,
						includeContent: true,
						previewChars: 0,
						maxBytes: 200_000
					})
				});
				const data = await r.json().catch(() => ({}));
				if (!r.ok) throw new Error(data?.error || `Git fetch failed (${r.status})`);
				const got = Array.isArray(data.files) ? data.files : [];
				filesForDoc = got.map((f: any) => ({ path: f.path, content: String(f.content || '') }));
			} else if (method === 'zipped_folder') {
				if (!zipFile) throw new Error('Please choose a .zip file first.');
				const fd = new FormData();
				fd.append('zip', zipFile);
				fd.append('includeContent', 'true');
				fd.append('previewChars', '0');
				fd.append('maxBytes', '200000');
				const r = await fetch('/api/files/zip', { method: 'POST', body: fd });
				const data = await r.json().catch(() => ({}));
				if (!r.ok) throw new Error(data?.error || `Zip read failed (${r.status})`);
				const got = Array.isArray(data.files) ? data.files : [];
				filesForDoc = got.map((f: any) => ({ path: f.path, content: String(f.content || '') }));
			} else {
				// pasted_code
				filesForDoc = [{ path: pasteFilename || 'snippet.txt', content: pasteCode || '' }];
			}

			if (!filesForDoc.length) throw new Error('No content gathered for summarization.');

			// 3) LLM: generate documentation
			statusMsg = 'Summarizing with AI…';
			const rGen = await fetch('/api/docs/generate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					projectName: docTitle || 'Documentation Draft',
					files: filesForDoc
				})
			});
			const text = await rGen.text();
			let gen: any;
			try {
				gen = JSON.parse(text);
			} catch {
				throw new Error(
					`Expected JSON from generator but got non-JSON (status ${rGen.status}). First bytes: ${text.slice(
						0,
						200
					)}`
				);
			}
			if (!rGen.ok) throw new Error(gen?.error || `Generate failed (${rGen.status})`);
			const markdown = String(gen.markdown || '');

			// 4) Save final result
			statusMsg = 'Saving to Supabase…';
			// RLS allows UPDATE only if created_by = auth.uid().
			// Because this row was created by us, this update will succeed only for us.
			const { error: uerr } = await supabase
				.from('submissions')
				.update({
					title: docTitle || 'Untitled',
					markdown,
					status: 'completed' as Status,
					summary: markdown.replace(/\s+/g, ' ').slice(0, 200)
				})
				.eq('id', submissionId as string);
			if (uerr) throw new Error(uerr.message);

			// 5) Done → /edit/{id} (changed from /history)
			statusMsg = 'Done. Redirecting…';
			window.location.href = `/edit/${submissionId}`;
		} catch (e) {
			errorMsg = String(e);
			statusMsg = '';
			// best-effort: mark failed if we created a submission row
			if (submissionId) {
				await supabase
					.from('submissions')
					.update({ status: 'failed' as Status, error_message: errorMsg.slice(0, 500) })
					.eq('id', submissionId);
			}
		} finally {
			running = false;
		}
	}
</script>

<!-- ======================= MARKUP ======================= -->
<div class="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
	<div class="mx-auto max-w-3xl">
		<!-- Header -->
		<div class="mb-8">
			<h1 class="mb-2 text-3xl font-bold text-white">Submit Source</h1>
			<p class="text-white/70">
				Pick a method, provide inputs, select files (for Git), then Analyze & Save.
			</p>
		</div>

		<!-- Method selector -->
		<div class="mb-6 grid grid-cols-2 gap-2 md:grid-cols-4">
			{#each [{ id: 'github_repo', label: 'Git Repo' }, { id: 'github_repo_directory', label: 'Git Directory' }, { id: 'zipped_folder', label: 'Zip Upload' }, { id: 'pasted_code', label: 'Paste Code' }] as opt}
				<button
					class="flex items-center justify-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-sm text-white transition hover:bg-white/10"
					class:selected={method === (opt.id as InputType)}
					on:click={() => (method = opt.id as InputType)}
					aria-pressed={method === (opt.id as InputType)}
				>
					<svelte:component this={getMethodIcon(opt.id as InputType)} class="h-4 w-4" />
					<span>{opt.label}</span>
				</button>
			{/each}
		</div>

		<!-- Common: Title -->
		<label class="mb-4 block">
			<div class="mb-1 text-sm text-white/70">Document title</div>
			<input
				class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
				bind:value={docTitle}
				placeholder="e.g., API Overview"
			/>
		</label>

		<!-- Method-specific inputs -->
		{#if method === 'github_repo' || method === 'github_repo_directory'}
			<div class="mb-4 grid gap-3 md:grid-cols-2">
				<label class="block md:col-span-2">
					<div class="mb-1 text-sm text-white/70">GitHub repo URL</div>
					<input
						class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
						bind:value={repoUrl}
						placeholder="https://github.com/owner/repo"
					/>
				</label>

				<label class="block">
					<div class="mb-1 text-sm text-white/70">Branch</div>
					<input
						class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
						bind:value={branch}
						placeholder="main"
					/>
				</label>

				{#if method === 'github_repo_directory'}
					<label class="block">
						<div class="mb-1 text-sm text-white/70">Subfolder (optional)</div>
						<input
							class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
							bind:value={subdir}
							placeholder="e.g. backend"
						/>
					</label>
				{/if}
			</div>

			<!-- Git file list -->
			<div class="mb-6 rounded-2xl border border-white/20 bg-white/10 p-4">
				<div class="mb-3 flex items-center justify-between">
					<div class="text-sm text-white/70">
						Files in repository{#if method === 'github_repo_directory' && subdir}
							/{subdir}{/if}
					</div>
					<div class="flex items-center gap-2">
						{#if showLoadButton}
							<!-- CHANGED: Only show while no files are loaded -->
							<button
								class="rounded-lg border border-white/20 px-3 py-1 text-sm text-white hover:bg-white/10"
								on:click={listGitFiles}
								disabled={listing}
								title="List files from Git"
							>
								{#if listing}
									<span class="inline-flex items-center gap-2"
										><Loader2 class="h-4 w-4 animate-spin" /> Loading…</span
									>
								{:else}
									Load files
								{/if}
							</button>
						{/if}

						{#if pickerFiles.length}
							<button
								class="rounded-lg border border-white/20 px-3 py-1 text-sm text-white hover:bg-white/10"
								on:click={selectAll}
							>
								Select all
							</button>
							<button
								class="rounded-lg border border-white/20 px-3 py-1 text-sm text-white hover:bg-white/10"
								on:click={clearAll}
							>
								Clear
							</button>
						{/if}
					</div>
				</div>

				{#if pickerFiles.length}
					<div class="max-h-64 overflow-auto rounded-lg border border-white/10">
						<ul class="divide-y divide-white/10">
							{#each pickerFiles as f}
								<li class="flex items-center gap-3 px-3 py-2">
									<input
										type="checkbox"
										checked={selectedPaths.has(f.path)}
										on:change={() => togglePick(f.path)}
									/>
									<span class="font-mono text-sm text-white/90">{f.path}</span>
									<span class="ml-auto text-xs text-white/50">{f.size} bytes</span>
								</li>
							{/each}
						</ul>
					</div>
				{:else}
					<div class="text-sm text-white/60">No files loaded yet.</div>
				{/if}
			</div>
		{:else if method === 'zipped_folder'}
			<div class="mb-6 rounded-2xl border border-white/20 bg-white/10 p-4">
				<label class="block">
					<div class="mb-1 text-sm text-white/70">Upload a .zip file</div>
					<input
						type="file"
						accept=".zip"
						class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white file:mr-3 file:rounded file:border-0 file:bg-white/20 file:px-3 file:py-1 file:text-white hover:bg-white/5"
						on:change={(e: any) => (zipFile = e?.currentTarget?.files?.[0] ?? null)}
					/>
					{#if zipFile}
						<div class="mt-2 text-sm text-white/70">Selected: {zipFile.name}</div>
					{/if}
				</label>
			</div>
		{:else if method === 'pasted_code'}
			<div class="mb-6 rounded-2xl border border-white/20 bg-white/10 p-4">
				<div class="grid gap-3 md:grid-cols-2">
					<label class="block">
						<div class="mb-1 text-sm text-white/70">Filename</div>
						<input
							class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
							bind:value={pasteFilename}
							placeholder="snippet.txt"
						/>
					</label>
					<div></div>
					<label class="block md:col-span-2">
						<div class="mb-1 text-sm text-white/70">Paste your code</div>
						<textarea
							class="h-48 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
							bind:value={pasteCode}
							placeholder="// paste here…"
						></textarea>
					</label>
				</div>
			</div>
		{/if}

		<!-- Error / Status -->
		{#if errorMsg}
			<div class="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-red-200">
				{errorMsg}
			</div>
		{/if}
		{#if statusMsg}
			<div class="mb-4 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white/80">
				{statusMsg}
			</div>
		{/if}

		<!-- Primary CTA -->
		<div class="flex items-center gap-3">
			<button
				class="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-2.5 text-white shadow hover:from-purple-600 hover:to-pink-600 disabled:opacity-60"
				on:click|preventDefault={analyzeAndSave}
				disabled={running}
			>
				{#if running}
					<Loader2 class="h-4 w-4 animate-spin" />
					<span>Analyzing…</span>
				{:else}
					<span>Analyze & Save</span>
				{/if}
			</button>

			<a
				href="/history"
				class="rounded-xl border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
			>
				View History
			</a>
		</div>
	</div>
</div>

<style>
	/* Small helper so the selected method chip feels active */
	/* button[selected], */
	button[aria-pressed='true'] {
		background: rgba(255, 255, 255, 0.12);
		border-color: rgba(255, 255, 255, 0.35);
	}
</style>
