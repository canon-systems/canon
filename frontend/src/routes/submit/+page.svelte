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
	import { onMount } from 'svelte';

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

	// Model selection
	// Complete list of models available through Vercel AI Gateway
	// Cost indicators based on actual pricing: $ = cheapest, $$$$$ = most expensive
	const availableModels = [
		// OpenAI Models
		{
			value: 'gpt-4o',
			label: 'GPT-4o',
			provider: 'OpenAI',
			cost: '$$$$',
			context: '128K tokens',
			description: 'Our most advanced, multimodal flagship model that\'s faster and 50% cheaper than GPT-4 Turbo. GPT-4o ("o" for "omni") is trained across text, vision, and audio.'
		},
		{
			value: 'gpt-4o-mini',
			label: 'GPT-4o Mini',
			provider: 'OpenAI',
			cost: '$',
			context: '128K tokens',
			description: 'A smaller, more affordable variant of GPT-4o. Fast, intelligent, and cost-effective for most tasks.'
		},
		{
			value: 'gpt-4-turbo',
			label: 'GPT-4 Turbo',
			provider: 'OpenAI',
			cost: '$$$$$',
			context: '128K tokens',
			description: 'A large multimodal model (accepting text or image inputs and outputting text) that can solve complex tasks with greater accuracy than any of our previous models.'
		},
		{
			value: 'gpt-4',
			label: 'GPT-4',
			provider: 'OpenAI',
			cost: '$$$$$',
			context: '8K tokens',
			description: 'A large multimodal model (accepting text or image inputs and outputting text) that can solve difficult problems with greater accuracy than any of our previous models.'
		},
		{
			value: 'gpt-3.5-turbo',
			label: 'GPT-3.5 Turbo',
			provider: 'OpenAI',
			cost: '$',
			context: '16K tokens',
			description: 'A high-performance, cost-effective model optimized for chat and text completion tasks. Fast and efficient for most use cases.'
		},
		{
			value: 'o1-preview',
			label: 'O1 Preview',
			provider: 'OpenAI',
			cost: '$$$$$',
			context: '128K tokens',
			description: 'Advanced reasoning model optimized for complex problem-solving and deep analysis. Uses a different architecture focused on reasoning capabilities.'
		},
		{
			value: 'o1-mini',
			label: 'O1 Mini',
			provider: 'OpenAI',
			cost: '$$$',
			context: '128K tokens',
			description: 'A smaller, more affordable version of O1. Optimized for reasoning tasks with improved cost efficiency.'
		},
		// Anthropic Models
		{
			value: 'claude-3-5-sonnet-20241022',
			label: 'Claude 3.5 Sonnet',
			provider: 'Anthropic',
			cost: '$$$$',
			context: '200K tokens',
			description: 'Our most intelligent model, with improved performance on coding tasks, math, and following complex, multi-step instructions. Excels at nuanced content creation and sophisticated Q&A.'
		},
		{
			value: 'claude-3-opus-20240229',
			label: 'Claude 3 Opus',
			provider: 'Anthropic',
			cost: '$$$$$',
			context: '200K tokens',
			description: 'Our most powerful model for highly complex tasks. Best for tasks that require deep analysis, complex content creation, code generation, and research.'
		},
		{
			value: 'claude-3-sonnet-20240229',
			label: 'Claude 3 Sonnet',
			provider: 'Anthropic',
			cost: '$$$',
			context: '200K tokens',
			description: 'A balanced model for enterprise workloads. Ideal for tasks requiring rapid responses, like knowledge retrieval or sales automation.'
		},
		{
			value: 'claude-3-haiku-20240307',
			label: 'Claude 3 Haiku',
			provider: 'Anthropic',
			cost: '$',
			context: '200K tokens',
			description: 'Our fastest and most compact model for near-instant responsiveness. Perfect for simple queries, lightweight tasks, and high-volume use cases.'
		},
		{
			value: 'claude-3-5-haiku-20241022',
			label: 'Claude 3.5 Haiku',
			provider: 'Anthropic',
			cost: '$$',
			context: '200K tokens',
			description: 'An improved version of Haiku with better performance while maintaining speed and cost efficiency. Great for general-purpose tasks.'
		},
		// Google Models
		{
			value: 'gemini-2.0-flash-exp',
			label: 'Gemini 2.0 Flash (Experimental)',
			provider: 'Google',
			cost: '$$',
			context: '1M tokens',
			description: 'Experimental model with massive 1M token context window. Supports text, vision, audio, and function calling. Optimized for speed and efficiency.'
		},
		{
			value: 'gemini-1.5-pro',
			label: 'Gemini 1.5 Pro',
			provider: 'Google',
			cost: '$$$$',
			context: '2M tokens',
			description: 'Google\'s most capable model with an enormous 2M token context window. Excellent for complex reasoning, code generation, and multimodal tasks.'
		},
		{
			value: 'gemini-1.5-flash',
			label: 'Gemini 1.5 Flash',
			provider: 'Google',
			cost: '$$',
			context: '1M tokens',
			description: 'Fast and efficient model with 1M token context window. Great balance of speed, cost, and capability for most use cases.'
		},
		{
			value: 'gemini-1.5-flash-8b',
			label: 'Gemini 1.5 Flash 8B',
			provider: 'Google',
			cost: '$',
			context: '1M tokens',
			description: 'Lightweight 8B parameter model with 1M token context. Ultra-fast and cost-effective for simple tasks.'
		}
	];
	let selectedModel = 'gpt-4o'; // Default model
	let showModelDropdown = false; // For custom dropdown

	// Helper to get selected model object
	$: selectedModelObj = availableModels.find((m) => m.value === selectedModel) || availableModels[0];

	// Click outside handler for dropdown
	let modelDropdownRef: HTMLElement | null = null;
	onMount(() => {
		function handleClickOutside(event: MouseEvent) {
			if (showModelDropdown && modelDropdownRef && !modelDropdownRef.contains(event.target as Node)) {
				showModelDropdown = false;
			}
		}
		document.addEventListener('click', handleClickOutside);
		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});

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
					? { filename: pasteFilename, model: selectedModel }
					: method === 'zipped_folder'
						? { zip_name: zipFile?.name ?? null, model: selectedModel }
						: { repoUrl, branch, model: selectedModel, ...(method === 'github_repo_directory' ? { subdir } : {}) };

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
					files: filesForDoc,
					model: selectedModel
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

			// 4) Save final result with code snapshot (for GitHub repos)
			statusMsg = 'Saving to Supabase…';
			// RLS allows UPDATE only if created_by = auth.uid().
			// Because this row was created by us, this update will succeed only for us.

			// Build code snapshot for tracking changes (only for GitHub repos)
			let codeSnapshot: any = null;
			if (isGit && repoUrl && branch) {
				try {
					const selectedFiles = selectedArray();
					if (selectedFiles.length === 0) {
						console.warn('No files selected for snapshot');
					} else {
						// Get commit SHA and file SHAs
						const snapshotRes = await fetch('/api/github/snapshot', {
							method: 'POST',
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({
								repoUrl,
								branch,
								selectedFiles
							})
						});

						if (snapshotRes.ok) {
							const snapshotData = await snapshotRes.json().catch(() => null);
							if (snapshotData?.commitSha && snapshotData?.fileShas) {
								codeSnapshot = {
									commitSha: snapshotData.commitSha,
									fileShas: snapshotData.fileShas,
									createdAt: new Date().toISOString()
								};
							} else {
								console.warn('Snapshot API returned invalid data:', snapshotData);
							}
						} else {
							const errorData = await snapshotRes.json().catch(() => ({}));
							console.warn('Snapshot API failed:', snapshotRes.status, errorData);
						}
					}
				} catch (e) {
					// Non-fatal: continue without snapshot
					console.warn('Failed to create code snapshot:', e);
				}
			}

			const { error: uerr } = await supabase
				.from('submissions')
				.update({
					title: docTitle || 'Untitled',
					markdown,
					status: 'completed' as Status,
					summary: markdown.replace(/\s+/g, ' ').slice(0, 200),
					...(codeSnapshot ? { code_snapshot: codeSnapshot } : {})
				})
				.eq('id', submissionId as string);
			if (uerr) throw new Error(uerr.message);

			// At this point:
			//   - The submission row exists
			//   - markdown, summary, status, and code_snapshot are saved
			//
			// Now we tell the server:
			//   "Hey, for this submissionId, please update submission_files
			//    using the stored code_snapshot."
			//
			// We do this as a best-effort, non-blocking step.
			// If it fails, the documentation is STILL saved and usable.
			// It just means auto-update tracking might be missing for that run.
			if (submissionId && codeSnapshot) {
				try {
					await fetch('/api/docs/post-process', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ submissionId })
					});
					// We do not need to inspect the response here.
					// If it fails, logs on the server will tell us what happened.
				} catch (e) {
					console.warn('Failed to post-process submission (submission_files):', e);
				}
			}

			// 5) Done → /edit/{id}
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

		<!-- Common: Title and Model -->
		<div class="mb-4 grid gap-4 md:grid-cols-2">
			<label class="block">
				<div class="mb-1 text-sm text-white/70">Document title</div>
				<input
					class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
					bind:value={docTitle}
					placeholder="e.g., API Overview"
				/>
			</label>
			<label class="block">
				<div class="mb-1 text-sm text-white/70">AI Model</div>
				<div class="relative" bind:this={modelDropdownRef}>
					<!-- Custom Dropdown Button -->
					<button
						type="button"
						class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-left text-white outline-none focus:border-white/40 focus:ring-2 focus:ring-white/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between"
						on:click={() => !running && (showModelDropdown = !showModelDropdown)}
						disabled={running}
					>
						<div class="flex items-center gap-2 flex-wrap">
							<span class="font-medium">{selectedModelObj.label}</span>
							<span class="text-xs text-white/60">({selectedModelObj.provider})</span>
							<span class="text-xs text-yellow-400">{selectedModelObj.cost}</span>
							<span class="text-xs text-blue-400">{selectedModelObj.context}</span>
						</div>
						<svg
							class="h-4 w-4 text-white/60 transition-transform"
							class:rotate-180={showModelDropdown}
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
						</svg>
					</button>

					<!-- Dropdown Menu -->
					{#if showModelDropdown}
						<div
							class="absolute z-50 mt-1 max-h-96 w-full overflow-auto rounded-lg border border-white/20 bg-gray-900 shadow-xl"
							role="listbox"
						>
							{#each availableModels as model}
								<button
									type="button"
									class="w-full px-4 py-3 text-left transition-colors hover:bg-white/10 focus:bg-white/10 focus:outline-none {selectedModel === model.value ? 'bg-white/15' : ''}"
									on:click={() => {
										selectedModel = model.value;
										showModelDropdown = false;
									}}
									role="option"
									aria-selected={selectedModel === model.value}
								>
									<div class="flex items-start justify-between gap-3">
										<div class="flex-1 min-w-0">
											<div class="flex items-center gap-2 mb-1 flex-wrap">
												<span class="font-semibold text-white">{model.label}</span>
												<span class="text-xs text-white/60">({model.provider})</span>
												<span class="text-xs text-yellow-400 font-medium">{model.cost}</span>
												<span class="text-xs text-blue-400 font-medium">{model.context}</span>
											</div>
											<p class="text-xs text-white/70 leading-relaxed">{model.description}</p>
										</div>
										{#if selectedModel === model.value}
											<svg
												class="h-5 w-5 shrink-0 text-green-400"
												fill="currentColor"
												viewBox="0 0 20 20"
											>
												<path
													fill-rule="evenodd"
													d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
													clip-rule="evenodd"
												/>
											</svg>
										{/if}
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</label>
		</div>

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
				href="/edit"
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
