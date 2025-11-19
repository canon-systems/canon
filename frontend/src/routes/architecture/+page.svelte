<script lang="ts">
	import { Github, Upload, Loader2, Download, Copy, Check } from '@lucide/svelte';
	import { onMount } from 'svelte';

	type InputType = 'github_repo_directory' | 'zipped_folder';
	type Status = 'idle' | 'processing' | 'completed' | 'error';

	let method: InputType = 'github_repo_directory';
	let status: Status = 'idle';
	let errorMessage = '';

	// GitHub inputs
	let repoUrl = '';
	let branch = 'main';
	let subdir = '';

	// Dropdown options
	let branches: string[] = [];
	let directories: string[] = [];
	let loadingBranches = false;
	let loadingDirectories = false;

	// Zip input
	let zipFile: File | null = null;

	// Results
	let diagramMarkdown = '';
	let detectedTools: any = null;
	let copied = false;

	onMount(() => {
		// Load Mermaid for rendering with dark theme
		if (typeof window !== 'undefined') {
			const loadMermaid = async () => {
				if (!(window as any).mermaid) {
					const mermaidModule = await import('https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs');
					mermaidModule.default.initialize({
						startOnLoad: true,
						theme: 'dark',
						themeVariables: {
							primaryColor: '#1e40af',
							primaryTextColor: '#ffffff',
							primaryBorderColor: '#3b82f6',
							lineColor: '#ffffff40',
							secondaryColor: '#374151',
							tertiaryColor: '#6d28d9',
							background: '#111827',
							mainBkgColor: '#1f2937',
							textColor: '#ffffff',
							border1: '#ffffff20',
							border2: '#ffffff40',
							arrowheadColor: '#ffffff60',
							clusterBkg: '#1f2937',
							clusterBorder: '#ffffff20',
							defaultLinkColor: '#ffffff40'
						}
					});
					(window as any).mermaid = mermaidModule.default;
				}
			};
			loadMermaid();
		}
	});

	// Fetch branches when repo URL changes
	async function fetchBranches() {
		if (!repoUrl.trim() || !repoUrl.includes('github.com')) {
			branches = [];
			return;
		}

		loadingBranches = true;
		try {
			const response = await fetch('/api/github/branches', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ repoUrl })
			});

			if (response.ok) {
				const data = await response.json();
				branches = data.branches || [];
				// Auto-select first branch if available and none selected
				if (branches.length > 0 && !branches.includes(branch)) {
					branch = branches[0];
					// Fetch directories for the new branch
					fetchDirectories();
				}
			} else {
				branches = [];
			}
		} catch (err) {
			console.error('Failed to fetch branches:', err);
			branches = [];
		} finally {
			loadingBranches = false;
		}
	}

	// Fetch directories when repo URL or branch changes
	async function fetchDirectories() {
		if (!repoUrl.trim() || !repoUrl.includes('github.com') || !branch) {
			directories = [];
			return;
		}

		loadingDirectories = true;
		try {
			const response = await fetch('/api/github/directories', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ repoUrl, branch })
			});

			if (response.ok) {
				const data = await response.json();
				directories = data.directories || [];
			} else {
				directories = [];
			}
		} catch (err) {
			console.error('Failed to fetch directories:', err);
			directories = [];
		} finally {
			loadingDirectories = false;
		}
	}

	// React to repo URL changes (with debounce to avoid multiple calls)
	let repoUrlKey = '';
	$: {
		const newKey = repoUrl && repoUrl.includes('github.com') ? repoUrl : '';
		if (newKey !== repoUrlKey) {
			repoUrlKey = newKey;
			if (newKey) {
				fetchBranches();
			} else {
				branches = [];
				directories = [];
				branch = 'main';
				subdir = '';
			}
		}
	}

	// React to branch changes
	let branchKey = '';
	$: {
		const newKey = branch && repoUrl && repoUrl.includes('github.com') ? `${repoUrl}|${branch}` : '';
		if (newKey !== branchKey) {
			branchKey = newKey;
			if (newKey && branch) {
				fetchDirectories();
			} else {
				directories = [];
				subdir = '';
			}
		}
	}

	async function handleSubmit() {
		if (status === 'processing') return;

		status = 'processing';
		errorMessage = '';
		diagramMarkdown = '';
		detectedTools = null;

		try {
			const formData = new FormData();

			if (method === 'github_repo_directory') {
				if (!repoUrl.trim()) {
					throw new Error('Please enter a GitHub repository URL');
				}
				if (!branch) {
					throw new Error('Please select a branch');
				}
				formData.append('method', 'github');
				formData.append('repoUrl', repoUrl.trim());
				formData.append('branch', branch.trim());
				if (subdir.trim()) {
					formData.append('subdir', subdir.trim());
				}
			} else if (method === 'zipped_folder') {
				if (!zipFile) {
					throw new Error('Please select a ZIP file');
				}
				formData.append('method', 'zip');
				formData.append('zipFile', zipFile);
			}

			const response = await fetch('/api/architecture/generate', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				const error = await response.json().catch(() => ({ error: 'Unknown error' }));
				throw new Error(error.error || `Server error: ${response.status}`);
			}

			const result = await response.json();
			diagramMarkdown = result.diagram;
			detectedTools = result.tools;
			status = 'completed';

			// Re-initialize Mermaid after content is loaded with dark theme
			if (typeof window !== 'undefined') {
				setTimeout(async () => {
					const mermaidElements = document.querySelectorAll('.mermaid');
					if (mermaidElements.length > 0) {
						if (!(window as any).mermaid) {
							const mermaidModule = await import('https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs');
							mermaidModule.default.initialize({
								startOnLoad: true,
								theme: 'dark',
								themeVariables: {
									primaryColor: '#1e40af',
									primaryTextColor: '#ffffff',
									primaryBorderColor: '#3b82f6',
									lineColor: '#ffffff40',
									secondaryColor: '#374151',
									tertiaryColor: '#6d28d9',
									background: '#111827',
									mainBkgColor: '#1f2937',
									secondBkgColor: '#374151',
									textColor: '#ffffff',
									border1: '#ffffff20',
									border2: '#ffffff40',
									arrowheadColor: '#ffffff60',
									clusterBkg: '#1f2937',
									clusterBorder: '#ffffff20',
									defaultLinkColor: '#ffffff40',
									titleColor: '#ffffff',
									edgeLabelBackground: '#1f2937',
									actorBorder: '#ffffff40',
									actorBkg: '#1e40af',
									actorTextColor: '#ffffff',
									actorLineColor: '#ffffff40',
									signalColor: '#ffffff',
									signalTextColor: '#ffffff',
									labelBoxBkgColor: '#374151',
									labelBoxBorderColor: '#ffffff40',
									labelTextColor: '#ffffff',
									loopTextColor: '#ffffff',
									noteBorderColor: '#ffffff40',
									noteBkgColor: '#374151',
									noteTextColor: '#ffffff',
									activationBorderColor: '#3b82f6',
									activationBkgColor: '#1e40af',
									sequenceNumberColor: '#ffffff',
									sectionBkgColor: '#1f2937',
									altBkgColor: '#374151',
									altBkgColorLight: '#4b5563',
									excludeBkgColor: '#1f2937',
									excludeBorderColor: '#ffffff20',
									labelColor: '#ffffff',
									errorBkgColor: '#dc2626',
									errorTextColor: '#ffffff'
								}
							});
							(window as any).mermaid = mermaidModule.default;
						}
						// Mermaid should auto-render with startOnLoad, but trigger if needed
						if ((window as any).mermaid) {
							(window as any).mermaid.run();
						}
					}
				}, 500);
			}
		} catch (err: any) {
			errorMessage = err.message || 'Failed to generate architecture diagram';
			status = 'error';
		}
	}

	function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files && target.files[0]) {
			zipFile = target.files[0];
		}
	}

	async function copyToClipboard() {
		if (diagramMarkdown) {
			await navigator.clipboard.writeText(diagramMarkdown);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		}
	}

	function downloadMarkdown() {
		if (diagramMarkdown) {
			const blob = new Blob([diagramMarkdown], { type: 'text/markdown' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = 'architecture.md';
			a.click();
			URL.revokeObjectURL(url);
		}
	}
</script>

<div class="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
	<div class="mb-8">
		<h1 class="text-3xl font-bold text-white mb-2">Architecture Diagram Generator</h1>
		<p class="text-white/70">
			Analyze your codebase and automatically generate a visual architecture diagram showing all tools,
			services, and their connections.
		</p>
	</div>

	<!-- Input Form -->
	<div class="mb-8 rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
		<div class="mb-6">
			<label class="mb-3 block text-sm font-medium text-white">Input Method</label>
			<div class="flex gap-4">
				<label class="flex items-center gap-2 cursor-pointer">
					<input
						type="radio"
						name="method"
						value="github_repo_directory"
						bind:group={method}
						class="h-4 w-4 text-blue-500"
					/>
					<Github class="h-4 w-4 text-white/70" />
					<span class="text-sm text-white/80">GitHub Repository</span>
				</label>
				<label class="flex items-center gap-2 cursor-pointer">
					<input
						type="radio"
						name="method"
						value="zipped_folder"
						bind:group={method}
						class="h-4 w-4 text-blue-500"
					/>
					<Upload class="h-4 w-4 text-white/70" />
					<span class="text-sm text-white/80">ZIP File</span>
				</label>
			</div>
		</div>

		{#if method === 'github_repo_directory'}
			<div class="space-y-4">
				<div>
					<label for="repoUrl" class="mb-2 block text-sm font-medium text-white">
						GitHub Repository URL
					</label>
					<input
						id="repoUrl"
						type="text"
						bind:value={repoUrl}
						placeholder="https://github.com/owner/repo"
						class="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
					/>
					{#if loadingBranches}
						<p class="mt-1 text-xs text-white/50">Loading branches...</p>
					{/if}
				</div>
				<div class="grid gap-4 md:grid-cols-2">
					<div>
						<label for="branch" class="mb-2 block text-sm font-medium text-white">Branch</label>
						<select
							id="branch"
							bind:value={branch}
							disabled={loadingBranches || branches.length === 0}
							class="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{#if branches.length === 0 && !loadingBranches}
								<option value="">Enter repo URL first</option>
							{:else if loadingBranches}
								<option value="">Loading...</option>
							{:else}
								{#each branches as b}
									<option value={b}>{b}</option>
								{/each}
							{/if}
						</select>
					</div>
					<div>
						<label for="subdir" class="mb-2 block text-sm font-medium text-white">
							Subdirectory (optional)
						</label>
						<select
							id="subdir"
							bind:value={subdir}
							disabled={loadingDirectories || !branch || branches.length === 0}
							class="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50"
						>
							<option value="">Root (all files)</option>
							{#if loadingDirectories}
								<option value="" disabled>Loading directories...</option>
							{:else if directories.length > 0}
								{#each directories as d}
									<option value={d}>{d}</option>
								{/each}
							{:else if branch && !loadingDirectories}
								<option value="" disabled>No subdirectories found</option>
							{/if}
						</select>
					</div>
				</div>
			</div>
		{:else if method === 'zipped_folder'}
			<div>
				<label for="zipFile" class="mb-2 block text-sm font-medium text-white">ZIP File</label>
				<input
					id="zipFile"
					type="file"
					accept=".zip"
					on:change={handleFileSelect}
					class="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white file:mr-4 file:rounded file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-white/20"
				/>
				{#if zipFile}
					<p class="mt-2 text-sm text-white/60">Selected: {zipFile.name}</p>
				{/if}
			</div>
		{/if}

		<button
			on:click={handleSubmit}
			disabled={status === 'processing'}
			class="mt-6 w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
		>
			{#if status === 'processing'}
				<span class="flex items-center justify-center gap-2">
					<Loader2 class="h-4 w-4 animate-spin" />
					Analyzing codebase...
				</span>
			{:else}
				Generate Architecture Diagram
			{/if}
		</button>
	</div>

	<!-- Error Message -->
	{#if errorMessage}
		<div class="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-200">
			<p class="font-medium">Error</p>
			<p class="text-sm">{errorMessage}</p>
		</div>
	{/if}

	<!-- Results -->
	{#if status === 'completed' && diagramMarkdown}
		<div class="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-xl font-bold text-white">Generated Architecture Diagram</h2>
				<div class="flex gap-2">
					<button
						on:click={copyToClipboard}
						class="flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
					>
						{#if copied}
							<Check class="h-4 w-4" />
							Copied!
						{:else}
							<Copy class="h-4 w-4" />
							Copy
						{/if}
					</button>
					<button
						on:click={downloadMarkdown}
						class="flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
					>
						<Download class="h-4 w-4" />
						Download
					</button>
				</div>
			</div>

			<!-- Mermaid Diagram -->
			<div class="mb-6 overflow-x-auto rounded-lg border border-white/10 bg-gradient-to-br from-gray-900 to-gray-950 p-6 backdrop-blur-sm">
				{@html `<div class="mermaid">${(() => {
					const match = diagramMarkdown.match(/```mermaid\n([\s\S]*?)```/);
					return match ? match[1] : diagramMarkdown.replace(/```mermaid\n/g, '').replace(/```\n/g, '');
				})()}</div>`}
			</div>

			<!-- Full Markdown -->
			<div class="mb-6">
				<details class="rounded-lg border border-white/10 bg-white/5">
					<summary class="cursor-pointer px-4 py-3 text-sm font-medium text-white/80">
						View Full Markdown
					</summary>
					<pre
						class="max-h-96 overflow-auto p-4 text-xs text-white/70"
					><code>{diagramMarkdown}</code></pre>
				</details>
			</div>

			<!-- Detected Tools Summary -->
			{#if detectedTools && detectedTools.tools}
				<div class="rounded-lg border border-white/10 bg-white/5 p-4">
					<h3 class="mb-3 text-lg font-semibold text-white">Detected Tools ({detectedTools.tools.length})</h3>
					<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{#each detectedTools.tools as tool}
							<div class="rounded border border-white/10 bg-white/5 p-3">
								<div class="flex items-center gap-2">
									<span class="text-lg">{tool.icon || '📦'}</span>
									<div>
										<p class="text-sm font-medium text-white">{tool.name}</p>
										<p class="text-xs text-white/60">{tool.description || 'No description'}</p>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	:global(.mermaid) {
		background: transparent;
		padding: 0;
		border-radius: 0.5rem;
	}

	:global(.mermaid svg) {
		background: transparent !important;
	}

	:global(.mermaid .node rect),
	:global(.mermaid .node circle),
	:global(.mermaid .node ellipse),
	:global(.mermaid .node polygon) {
		fill: #1e40af !important;
		stroke: #3b82f6 !important;
	}

	:global(.mermaid .edgePath .path) {
		stroke: rgba(255, 255, 255, 0.25) !important;
	}

	:global(.mermaid .edgeLabel) {
		background: rgba(31, 41, 55, 0.8) !important;
		color: rgba(255, 255, 255, 0.9) !important;
	}

	:global(.mermaid .label) {
		color: #ffffff !important;
	}
</style>

