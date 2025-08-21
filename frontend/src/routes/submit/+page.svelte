<script lang="ts">
	/**
	 * /submit page (client)
	 * - Opens a modal to collect input for one of 4 source types
	 * - Submits to +page.server.ts via SvelteKit form "enhance"
	 * - After server action finishes, `form` updates; we close the modal reactively
	 * - Lets you list files by calling /api/github/list with server‑confirmed values
	 */

	import { enhance } from '$app/forms';

	// From the server load() / action()
	export let data: { envStatus: { allPresent: boolean; status: Record<string, boolean> } };
	export let form: any;

	type SourceType = 'github' | 'git_subdir' | 'zip' | 'snippet' | null;

	// Which source the user is working with (controls which form fields appear)
	let selected: SourceType = null;

	// Modal visibility flag
	let modalOpen = false;

	// Local inputs bound to form fields in the modal
	let inputs = {
		repoUrl: '',
		branch: '',
		subdir: '',
		snippet: ''
	};

	// Open/close modal helpers
	function openModal(type: SourceType) {
		selected = type;
		modalOpen = true;
	}
	function closeModal() {
		modalOpen = false;
	}

	// IMPORTANT:
	// In SvelteKit v2, `enhance` can be used with no options. When the server
	// action finishes, SvelteKit injects the return value into the `form` prop.
	// We watch `form` reactively: once it changes *and* the modal is open, we
	// close the modal so the success panel underneath is visible.
	$: if (modalOpen && form) {
		modalOpen = false;
	}

	// If the user pasted a GitHub "tree" URL, auto‑fill branch/subdir on blur
	function tryAutofillFromUrl(url: string) {
		try {
			const u = new URL(url);
			if (u.hostname !== 'github.com') return;
			const parts = u.pathname.split('/').filter(Boolean);
			// e.g. /owner/repo/tree/<branch>/<maybe/sub/dir/...>
			if (parts.length >= 4 && parts[2] === 'tree') {
				const branch = parts[3];
				const rest = parts.slice(4);
				if (!inputs.branch) inputs.branch = branch;
				if (!inputs.subdir && rest.length > 0) inputs.subdir = rest.join('/');
			}
		} catch {
			// ignore malformed URLs
		}
	}

	// ─────────── File listing state & helpers (uses /api/github/list) ───────────
	let files: Array<{ path: string; size: number }> = [];
	let selectedPaths = new Set<string>();
	let listingError = '';
	let isListing = false;

	// Prefer server‑confirmed values (form.echo.*) after submit, fallback to current inputs
	function effectiveRepoUrl(): string {
		return (form?.echo?.repoUrl ?? inputs.repoUrl ?? '').toString().trim();
	}
	function effectiveBranch(): string {
		return (form?.echo?.branch ?? inputs.branch ?? '').toString().trim();
	}
	function effectiveSubdir(): string {
		return (form?.echo?.subdir ?? inputs.subdir ?? '').toString().trim();
	}

	async function fetchFiles() {
		listingError = '';
		files = [];
		selectedPaths.clear();
		isListing = true;

		try {
			const payload: any = {
				repoUrl: effectiveRepoUrl(),
				branch: effectiveBranch()
			};
			const subdir = effectiveSubdir();
			if (subdir) payload.subdir = subdir;

			if (!payload.repoUrl || !/^https?:\/\/(www\.)?github\.com\//i.test(payload.repoUrl)) {
				listingError = 'Please provide a valid GitHub repo URL in the form.';
				return;
			}

			const res = await fetch('/api/github/list', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const data = await res.json();

			if (!res.ok) {
				listingError = data?.error || 'Failed to list files.';
				return;
			}

			files = data.files || [];

			// Convenience pre‑selections
			for (const f of files) {
				const p = f.path.toLowerCase();
				if (
					p.endsWith('readme.md') ||
					p.endsWith('main.py') ||
					p.endsWith('main.go') ||
					p.endsWith('index.ts') ||
					p.endsWith('app.svelte')
				) {
					selectedPaths.add(f.path);
				}
			}
		} catch (e: any) {
			listingError = e?.message || 'Unexpected error while listing files.';
		} finally {
			isListing = false;
		}
	}

	function togglePath(p: string) {
		if (selectedPaths.has(p)) selectedPaths.delete(p);
		else selectedPaths.add(p);
		// reassign so Svelte detects the Set change
		selectedPaths = new Set(selectedPaths);
	}
</script>

<!-- PAGE WRAPPER -->
<div class="mx-auto max-w-3xl p-6">
	<h1 class="mb-2 text-3xl font-bold text-white">Connect a source</h1>
	<p class="mb-6 text-white/80">Choose a method, fill in the form, then submit.</p>

	<!-- Env status -->
	{#if data?.envStatus}
		{#if data.envStatus.allPresent}
			<div class="mb-6 rounded-xl border border-emerald-300/40 bg-emerald-500/20 p-4 text-white">
				<div class="font-semibold">Server can read all Orkes variables</div>
				<p class="text-sm opacity-80">You are ready to start workflows.</p>
			</div>
		{:else}
			<div class="mb-6 rounded-xl border border-red-300/50 bg-red-500/20 p-4 text-white">
				<div class="font-semibold">Some variables are missing</div>
				<p class="text-sm opacity-80">Fix <code>.env.local</code> and restart the dev server.</p>
				<ul class="mt-2 list-disc pl-6 text-sm">
					{#each Object.entries(data.envStatus.status) as [k, present]}
						{#if !present}<li>{k} is missing</li>{/if}
					{/each}
				</ul>
			</div>
		{/if}
	{/if}

	<!-- Source picker -->
	<div class="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
		<button
			class="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-left text-white hover:bg-white/20"
			on:click={() => openModal('github')}
		>
			<div class="font-semibold">GITHUB REPOSITORY</div>
			<div class="text-xs text-white/70">Analyze the whole repo</div>
		</button>

		<button
			class="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-left text-white hover:bg-white/20"
			on:click={() => openModal('git_subdir')}
		>
			<div class="font-semibold">GIT SUBDIRECTORY</div>
			<div class="text-xs text-white/70">Focus on a folder inside a repo</div>
		</button>

		<button
			class="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-left text-white hover:bg-white/20"
			on:click={() => openModal('zip')}
		>
			<div class="font-semibold">ZIP UPLOAD</div>
			<div class="text-xs text-white/70">Upload a .zip</div>
		</button>

		<button
			class="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-left text-white hover:bg-white/20"
			on:click={() => openModal('snippet')}
		>
			<div class="font-semibold">PASTED CODE</div>
			<div class="text-xs text-white/70">Paste code directly</div>
		</button>
	</div>

	<!-- Success & workflow details -->
	{#if form?.ok}
		<div class="rounded-xl border border-emerald-300/40 bg-emerald-500/20 p-4 text-white">
			<div class="font-semibold">Inputs received by the server ✓</div>
			<p class="text-sm opacity-80">Exactly what was sent to your Orkes workflow:</p>
			<pre class="mt-2 overflow-auto rounded bg-black/30 p-3 text-xs">{JSON.stringify(
					form.echo,
					null,
					2
				)}</pre>
		</div>

		{#if form?.orkes}
			<div class="mt-4 rounded-xl border border-white/20 bg-white/10 p-3 text-white">
				<div class="text-sm">
					<span class="opacity-80">Workflow</span>
					<span class="mx-1">•</span>
					<span class="font-semibold">{form.orkes.name} v{form.orkes.version}</span>
				</div>
				<div class="mt-1 text-xs opacity-80">Execution ID: {form.orkes.workflowId}</div>
			</div>
		{/if}
	{/if}

	{#if form?.error}
		<div class="rounded-xl border border-red-300/50 bg-red-500/20 p-4 text-white">
			<div class="font-semibold">There was a problem</div>
			<p class="mt-1 text-sm opacity-80">{form.error}</p>
		</div>
	{/if}

	<!-- File picker (only for GitHub modes after a successful submit) -->
	{#if form?.ok && (form?.echo?.sourceType === 'github' || form?.echo?.sourceType === 'git_subdir')}
		<div class="mt-6 rounded-2xl border border-white/20 bg-white/10 p-6 text-white">
			<div class="mb-3 text-lg font-semibold">Pick files to summarize</div>
			<p class="mb-4 text-sm text-white/70">
				Click "List files" to fetch the repo tree (we use server‑confirmed values).
			</p>

			<button
				class="rounded bg-white/10 px-3 py-2 hover:bg-white/20 disabled:opacity-60"
				on:click|preventDefault={fetchFiles}
				disabled={isListing}
			>
				{#if isListing}Listing…{:else}List files{/if}
			</button>

			{#if listingError}
				<div class="mt-3 rounded border border-red-300/50 bg-red-500/20 p-3 text-sm">
					{listingError}
				</div>
			{/if}

			{#if files.length > 0}
				<div class="mt-4 text-sm opacity-80">
					{files.length} files. Selected {selectedPaths.size}.
				</div>
				<div class="mt-2 max-h-80 overflow-auto rounded border border-white/10">
					<table class="w-full text-sm">
						<thead class="sticky top-0 bg-white/10">
							<tr>
								<th class="p-2 text-left">Select</th>
								<th class="p-2 text-left">Path</th>
								<th class="p-2 text-right">Size</th>
							</tr>
						</thead>
						<tbody>
							{#each files as f}
								<tr class="border-t border-white/10 hover:bg-white/5">
									<td class="p-2">
										<input
											type="checkbox"
											checked={selectedPaths.has(f.path)}
											on:change={() => togglePath(f.path)}
										/>
									</td>
									<td class="p-2 font-mono">{f.path}</td>
									<td class="p-2 text-right tabular-nums">{f.size}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<div class="mt-4">
					<button
						class="rounded bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 font-medium hover:from-purple-600 hover:to-pink-600"
						on:click|preventDefault={() => console.log('Selected paths', Array.from(selectedPaths))}
					>
						Continue with {selectedPaths.size} files
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- MODAL -->
{#if modalOpen && selected}
	<div class="fixed inset-0 z-50 flex items-center justify-center">
		<!-- backdrop -->
		<div class="absolute inset-0 bg-black/60" on:click={closeModal} aria-hidden="true"></div>

		<!-- card -->
		<div
			role="dialog"
			aria-modal="true"
			class="relative z-10 w-full max-w-xl rounded-2xl border border-white/20 bg-[#0b0b12]/95 p-6 text-white shadow-2xl backdrop-blur"
		>
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-lg font-semibold">
					{#if selected === 'github'}
						GitHub repository
					{:else if selected === 'git_subdir'}
						Git subdirectory
					{:else if selected === 'zip'}
						Upload ZIP
					{:else if selected === 'snippet'}
						Pasted code
					{/if}
				</h2>
				<button class="rounded bg-white/10 px-2 py-1 hover:bg-white/20" on:click={closeModal}
					>Close</button
				>
			</div>

			<!-- IMPORTANT: use:enhance with NO options; avoid any control named/id "submit" -->
			<form method="post" enctype="multipart/form-data" use:enhance class="space-y-4">
				<input type="hidden" name="sourceType" value={selected} />

				{#if selected === 'github'}
					<div>
						<label for="repoUrl" class="mb-1 block text-sm font-medium">Repository URL</label>
						<input
							id="repoUrl"
							name="repoUrl"
							class="w-full rounded border border-white/30 bg-white/10 px-3 py-2 placeholder:text-white/50"
							placeholder="https://github.com/owner/repo OR /tree/branch"
							bind:value={inputs.repoUrl}
							on:blur={() => tryAutofillFromUrl(inputs.repoUrl)}
							required
						/>
					</div>
					<div>
						<label for="branch" class="mb-1 block text-sm font-medium"
							>Branch (optional if in URL)</label
						>
						<input
							id="branch"
							name="branch"
							class="w-full rounded border border-white/30 bg-white/10 px-3 py-2 placeholder:text-white/50"
							placeholder="e.g. main"
							bind:value={inputs.branch}
						/>
					</div>
				{/if}

				{#if selected === 'git_subdir'}
					<div>
						<label for="repoUrl" class="mb-1 block text-sm font-medium">Repository URL</label>
						<input
							id="repoUrl"
							name="repoUrl"
							class="w-full rounded border border-white/30 bg-white/10 px-3 py-2 placeholder:text-white/50"
							placeholder="https://github.com/owner/repo OR /tree/branch/sub/dir"
							bind:value={inputs.repoUrl}
							on:blur={() => tryAutofillFromUrl(inputs.repoUrl)}
							required
						/>
					</div>
					<div>
						<label for="branch" class="mb-1 block text-sm font-medium"
							>Branch (optional if in URL)</label
						>
						<input
							id="branch"
							name="branch"
							class="w-full rounded border border-white/30 bg-white/10 px-3 py-2 placeholder:text-white/50"
							placeholder="e.g. main"
							bind:value={inputs.branch}
						/>
					</div>
					<div>
						<label for="subdir" class="mb-1 block text-sm font-medium"
							>Subdirectory (optional if in URL)</label
						>
						<input
							id="subdir"
							name="subdir"
							class="w-full rounded border border-white/30 bg-white/10 px-3 py-2 placeholder:text-white/50"
							placeholder="e.g. backend or src/app"
							bind:value={inputs.subdir}
						/>
					</div>
				{/if}

				{#if selected === 'zip'}
					<div>
						<label for="zipFile" class="mb-1 block text-sm font-medium">Upload a .zip</label>
						<input
							id="zipFile"
							name="zipFile"
							type="file"
							accept=".zip"
							class="block w-full rounded border border-white/30 bg-white/10 px-3 py-2 file:mr-3 file:rounded-md file:border-0 file:bg-white/20 file:px-3 file:py-2"
							required
						/>
					</div>
				{/if}

				{#if selected === 'snippet'}
					<div>
						<label for="snippet" class="mb-1 block text-sm font-medium">Code snippet</label>
						<textarea
							id="snippet"
							name="snippet"
							rows="10"
							class="w-full rounded border border-white/30 bg-white/10 px-3 py-2 font-mono text-sm placeholder:text-white/50"
							placeholder="// paste code here"
							bind:value={inputs.snippet}
							required
						></textarea>
					</div>
				{/if}

				<button
					type="submit"
					class="w-full rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 py-3 font-medium hover:from-purple-600 hover:to-pink-600"
				>
					Submit
				</button>
			</form>

			<p class="mt-3 text-xs text-white/60">
				Tip: Paste a full GitHub URL like <code>.../tree/branch/subdir</code> and fields auto‑fill.
			</p>
		</div>
	</div>
{/if}
