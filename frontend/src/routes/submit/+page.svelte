<script lang="ts">
	/**
	 * /submit page (client)
	 * - Lets the user choose any source at any time (can switch mid way)
	 * - Opens a modal for the chosen source and submits via SvelteKit enhance
	 * - Uses a local session number so we can reset UX without a hard reload
	 * - After a successful submit, GitHub modes can list files; other modes are done
	 * - Start another source bumps session and clears local state
	 */

	import { enhance } from '$app/forms';

	// From server load() / action()
	export let data: { envStatus: { allPresent: boolean; status: Record<string, boolean> } };

	type FormResponse = {
		session?: number;
		ok?: boolean;
		error?: string;
		echo?: {
			repoUrl?: string;
			branch?: string;
			subdir?: string;
			sourceType?: SourceType;
		};
		orkes?: {
			name: string;
			version: number;
			workflowId: string;
		};
	};

	export let form: FormResponse; // SvelteKit injects the latest action result here

	type SourceType = 'github' | 'git_subdir' | 'zip' | 'snippet' | null;

	// ────────────────────────────────────────────────────────────────────────────
	// FLOW STATE
	// ────────────────────────────────────────────────────────────────────────────

	// Local session counter. We send this to the server on submit; the server
	// echoes it back. That lets us close the modal and show results only when the
	// response matches our current session.
	let session = 1;

	// Which source is currently selected (controls which form renders in the modal)
	let selected: SourceType = null;

	// Modal visibility
	let modalOpen = false;

	// The first input inside the modal (for focus mgmt)
	let primaryInputEl: HTMLInputElement | HTMLTextAreaElement | null = null;
	let dialogEl: HTMLDialogElement | null = null;

	// Local inputs bound to modal fields (kept even when you switch sources)
	let inputs = {
		repoUrl: '',
		branch: '',
		subdir: '',
		snippet: ''
	};

	// When the modal opens, focus the first input
	$: if (modalOpen && primaryInputEl) {
		queueMicrotask(() => primaryInputEl?.focus());
	}

	// This reactive statement shows or hides the dialog based on the modalOpen variable.
	// The showModal method handles focus trapping and the Escape key for you.
	$: if (dialogEl) {
		if (modalOpen) {
			dialogEl.showModal();
		} else {
			dialogEl.close();
		}
	}

	function openModal(type: SourceType) {
		selected = type;
		modalOpen = true;
	}
	function closeModal() {
		modalOpen = false;
	}

	// Close when clicking the native backdrop area
	function handleBackdropClick(e: MouseEvent) {
		const d = e.currentTarget as HTMLDialogElement;
		const r = d.getBoundingClientRect();
		const x = e.clientX;
		const y = e.clientY;
		if (x < r.left || x > r.right || y < r.top || y > r.bottom) {
			closeModal();
		}
	}

	// IMPORTANT: In SvelteKit v2, enhance takes no options here.
	// When the current session action result arrives, form changes.
	// Only close the modal if the server echoed our current session.
	$: if (modalOpen && form?.session === session) {
		modalOpen = false;
	}

	// Soft reset: Start another source
	function startAnotherSource() {
		session += 1; // invalidate any prior server response
		selected = null; // go back to the source grid
		modalOpen = false; // ensure modal closed
		// Clear UI results and selections
		files = [];
		selectedPaths = new Set();
		listingError = '';
		isListing = false;
		// If you want to clear typed inputs too, uncomment:
		// inputs = { repoUrl: "", branch: "", subdir: "", snippet: "" };
	}

	// If the user pasted a GitHub /tree/<branch>/<sub/dir> URL, auto fill fields.
	function tryAutofillFromUrl(url: string) {
		try {
			const u = new URL(url);
			if (u.hostname !== 'github.com') return;
			const parts = u.pathname.split('/').filter(Boolean);
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

	// File listing state and helpers (GitHub modes only)
	let files: Array<{ path: string; size: number }> = [];
	let selectedPaths = new Set<string>();
	let listingError = '';
	let isListing = false;

	// We only trust a server action result that matches our session.
	const formForThisSession = () => (form?.session === session ? form : null);

	// Prefer server confirmed values after submit; fall back to current inputs
	function effectiveRepoUrl(): string {
		const f = formForThisSession();
		return (f?.echo?.repoUrl ?? inputs.repoUrl ?? '').toString().trim();
	}
	function effectiveBranch(): string {
		const f = formForThisSession();
		return (f?.echo?.branch ?? inputs.branch ?? '').toString().trim();
	}
	function effectiveSubdir(): string {
		const f = formForThisSession();
		return (f?.echo?.subdir ?? inputs.subdir ?? '').toString().trim();
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

			// Convenience pre selections
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
		selectedPaths = new Set(selectedPaths); // reassign so Svelte notices
	}
</script>

<div
	class="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-gray-950 via-gray-900 to-black text-white"
>
	<div class="mx-auto w-full max-w-3xl flex-1 p-6">
		<div class="mb-4 flex items-center justify-between">
			<div>
				<h1 class="mb-1 text-3xl font-bold text-white">Connect a source</h1>
				<p class="text-white/80">Pick a method, fill the fields, submit. Switch sources anytime.</p>
			</div>
			<button
				class="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20"
				on:click={startAnotherSource}
			>
				Start another source
			</button>
		</div>

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
							{#if !present}
								<li>{k} is missing</li>
							{/if}
						{/each}
					</ul>
				</div>
			{/if}
		{/if}

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

		{#if form?.session === session && form?.ok}
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

			{#if form?.echo?.sourceType === 'github' || form?.echo?.sourceType === 'git_subdir'}
				<div class="mt-6 rounded-2xl border border-white/20 bg-white/10 p-6 text-white">
					<div class="mb-3 flex items-center justify-between">
						<div class="text-lg font-semibold">Pick files to summarize</div>
						<button
							class="rounded bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
							on:click={startAnotherSource}
						>
							Start another source
						</button>
					</div>

					<p class="mb-4 text-sm text-white/70">
						Click List files to fetch the repo tree. We use server confirmed values below.
					</p>

					<div class="mb-3 text-xs text-white/60">
						<div>Repo: <code class="opacity-80">{effectiveRepoUrl()}</code></div>
						<div>Branch: <code class="opacity-80">{effectiveBranch() || '(required)'}</code></div>
						{#if effectiveSubdir()}
							<div>Subdir: <code class="opacity-80">{effectiveSubdir()}</code></div>
						{/if}
					</div>

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

						<div class="mt-4 flex gap-2">
							<button
								class="rounded bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 text-sm font-medium hover:from-purple-600 hover:to-pink-600"
								on:click|preventDefault={() => {
									// 1) Build a form in memory so we can reuse your existing /submit action
									const form = document.createElement('form');
									form.method = 'post';
									form.action = '/submit';

									// 2) Same session so your modal logic still works
									const s = document.createElement('input');
									s.name = 'session';
									s.value = String(session);
									form.appendChild(s);

									// 3) We keep the original sourceType (github or git_subdir)
									const st = document.createElement('input');
									st.name = 'sourceType';
									st.value =
										formForThisSession()?.echo?.sourceType || inputs.subdir
											? 'git_subdir'
											: 'github';
									form.appendChild(st);

									// 4) Echo back the server‑confirmed repoUrl/branch/subdir
									const r = document.createElement('input');
									r.name = 'repoUrl';
									r.value = effectiveRepoUrl();
									form.appendChild(r);

									const b = document.createElement('input');
									b.name = 'branch';
									b.value = effectiveBranch();
									form.appendChild(b);

									const sd = document.createElement('input');
									sd.name = 'subdir';
									sd.value = effectiveSubdir();
									form.appendChild(sd);

									// 5) Add the selected file paths as JSON
									const sel = document.createElement('input');
									sel.name = 'selectedFiles';
									sel.value = JSON.stringify(Array.from(selectedPaths));
									form.appendChild(sel);

									// 6) Submit
									document.body.appendChild(form);
									form.submit();
								}}
							>
								Continue with {selectedPaths.size} files
							</button>
							<button
								class="rounded border border-white/20 bg-white/10 px-3 py-2 text-sm hover:bg-white/20"
								on:click={startAnotherSource}
							>
								Start another source
							</button>
						</div>
					{/if}
				</div>
			{/if}
		{:else if form?.session === session && form?.error}
			<div class="rounded-xl border border-red-300/50 bg-red-500/20 p-4 text-white">
				<div class="font-semibold">There was a problem</div>
				<p class="mt-1 text-sm opacity-80">{form.error}</p>
			</div>
		{/if}
	</div>
</div>

{#if modalOpen && selected}
	<dialog
		bind:this={dialogEl}
		on:close={closeModal}
		on:click={handleBackdropClick}
		aria-modal="true"
		aria-labelledby="source-modal-title"
		class="fixed left-1/2 top-1/2 z-50 m-0 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/20 bg-white/5 p-6 text-white shadow-2xl"
	>
		<div class="mb-4 flex items-center justify-between">
			<h2 id="source-modal-title" class="text-lg font-semibold">
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
			<button
				type="button"
				aria-label="Close"
				class="rounded p-1 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/40"
				on:click={closeModal}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 20 20"
					fill="currentColor"
					class="h-5 w-5"
				>
					<path
						fill-rule="evenodd"
						d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414Z"
						clip-rule="evenodd"
					/>
				</svg>
			</button>
		</div>

		<form method="post" enctype="multipart/form-data" use:enhance class="space-y-4">
			<input type="hidden" name="session" value={session} />
			<input type="hidden" name="sourceType" value={selected} />

			{#if selected === 'github'}
				<div>
					<label for="repoUrl" class="mb-1 block text-sm font-medium">Repository URL</label>
					<input
						id="repoUrl"
						name="repoUrl"
						bind:this={primaryInputEl}
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
			{:else if selected === 'git_subdir'}
				<div>
					<label for="repoUrl2" class="mb-1 block text-sm font-medium">Repository URL</label>
					<input
						id="repoUrl2"
						name="repoUrl"
						bind:this={primaryInputEl}
						class="w-full rounded border border-white/30 bg-white/10 px-3 py-2 placeholder:text-white/50"
						placeholder="https://github.com/owner/repo OR /tree/branch/sub/dir"
						bind:value={inputs.repoUrl}
						on:blur={() => tryAutofillFromUrl(inputs.repoUrl)}
						required
					/>
				</div>
				<div>
					<label for="branch2" class="mb-1 block text-sm font-medium"
						>Branch (optional if in URL)</label
					>
					<input
						id="branch2"
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
			{:else if selected === 'zip'}
				<div>
					<label for="zipFile" class="mb-1 block text-sm font-medium">Upload a .zip</label>
					<input
						id="zipFile"
						name="zipFile"
						type="file"
						bind:this={primaryInputEl}
						accept=".zip"
						class="block w-full rounded border border-white/30 bg-white/10 px-3 py-2 file:mr-3 file:rounded-md file:border-0 file:bg-white/20 file:px-3 file:py-2"
						required
					/>
				</div>
			{:else if selected === 'snippet'}
				<div>
					<label for="snippet" class="mb-1 block text-sm font-medium">Code snippet</label>
					<textarea
						id="snippet"
						name="snippet"
						rows="10"
						bind:this={primaryInputEl}
						class="w-full rounded border border-white/30 bg-white/10 px-3 py-2 font-mono text-sm placeholder:text-white/50"
						placeholder="// paste code here"
						bind:value={inputs.snippet}
						required
					></textarea>
				</div>
			{/if}

			<div class="flex gap-2">
				<button
					type="submit"
					class="flex-1 rounded-xl bg-gradient-to-r from-gray-500 to-gray-700 py-3 font-medium hover:from-gray-600 hover:to-gray-800"
				>
					Submit
				</button>
			</div>
		</form>

		<p class="mt-3 text-xs text-white/60">
			Tip: Paste a full GitHub URL like <code>.../tree/branch/subdir</code> and fields auto fill.
		</p>
	</dialog>
{/if}

<style>
	dialog::backdrop {
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(6px);
	}
</style>
