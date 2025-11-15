<script lang="ts">
	// ------------------------------------------------------------
	// PURPOSE
	// Show one submission and allow the owner to edit title + rich content.
	// We still persist Markdown in the DB, converting from/to HTML for TipTap.
	// ------------------------------------------------------------

	// 1) Server-loaded row
	export let data: {
		submission: {
			id: string;
			created_date: string;
			title: string;
			markdown: string;
			status: 'processing' | 'completed' | 'failed';
			error_message: string | null;
			input_type: 'github_repo' | 'github_repo_directory' | 'zipped_folder' | 'pasted_code';
			input_content: string;
			summary: string | null;
		};
	};

	// 2) Local editable copies of title and markdown (we keep storing markdown)
	let title = data.submission.title;
	let markdown = data.submission.markdown;

	// 3) UI state for saves
	let saving = false;
	let saveMsg = '';
	let saveErr = '';

	// 4) Outdated files check state
	let checkingUpdates = false;
	let outdatedFiles: Array<{ file_path: string; old_hash: string; new_hash: string }> = [];
	let isOutdated = false;
	let regenerating = false;
	let regenerateMsg = '';
	let regenerateErr = '';

	// 4b) Notion push state
	let notionModalOpen = false;
	let loadingNotionPages = false;
	let notionPages: Array<{ id: string; properties?: any; url?: string }> = [];
	let selectedNotionPageId = '';
	let pushingToNotion = false;
	let notionPushMsg = '';
	let notionPushErr = '';

	// 5) Bring in Supabase + icons
	import { supabase } from '$lib/supabaseClient';
	import { Loader2, RefreshCw, AlertCircle, CheckCircle2, FileText, X } from '@lucide/svelte';
	import { onMount } from 'svelte';

	// 6) Bring in our rich editor component
	import RichTextEditor from '$lib/components/RichTextEditor.svelte';

	// 7) Converters
	// marked: Markdown -> HTML for TipTap initial content
	import { marked } from 'marked';
	// turndown: HTML -> Markdown when saving
	import TurndownService from 'turndown';
	const turndown = new TurndownService();

	// 8) Make initial HTML for the editor from the DB markdown
	//    If empty, provide a simple paragraph so the canvas is clickable.
	let initialHTML = (markdown && marked.parse(markdown)) || '<p></p>';

	// 9) Live HTML coming from the editor (we keep it in sync and convert on save)
	let html = String(initialHTML);

	// 10) Status hint
	$: statusNotice =
		data.submission.status === 'processing'
			? 'Note: This submission is still processing.'
			: data.submission.error_message
				? `Last run failed: ${data.submission.error_message}`
				: '';

	// 11) Receive change events from the editor and update our html + markdown
	function handleChange(e: CustomEvent<{ html: string }>) {
		html = e.detail.html;
		// keep the canonical markdown up to date, so Save uses latest value
		markdown = turndown.turndown(html);
	}

	// 12) Save handler: write title/markdown back to Supabase (unchanged table shape)
	async function saveChanges() {
		saveErr = '';
		saveMsg = '';
		saving = true;
		try {
			const { error } = await supabase
				.from('submissions')
				.update({
					title: title || 'Untitled',
					markdown, // store markdown as before
					summary: (markdown || '').replace(/\s+/g, ' ').slice(0, 200)
				})
				.eq('id', data.submission.id);

			if (error) throw new Error(error.message);
			saveMsg = 'Saved.';
		} catch (e) {
			saveErr = String(e);
		} finally {
			saving = false;
		}
	}

	// Add a ref to the preview container for imperative scrolling.
	let previewPane: HTMLDivElement | null = null;

	// Scroll-sync: when editor emits a ratio (0..1), scroll preview accordingly.
	function handleCursor(e: CustomEvent<{ ratio: number }>) {
		if (!previewPane) return;
		const ratio = e.detail.ratio;
		const max = Math.max(1, previewPane.scrollHeight - previewPane.clientHeight);
		// Choose 'smooth' if you prefer animated sync; 'auto' is instant.
		previewPane.scrollTo({ top: ratio * max, behavior: 'auto' });
	}

	// Check if this is a GitHub repo
	const isGitRepo =
		data.submission.input_type === 'github_repo' ||
		data.submission.input_type === 'github_repo_directory';

	// Check for outdated files (only for GitHub repos)
	async function checkForUpdates() {
		if (!isGitRepo) return;

		checkingUpdates = true;
		outdatedFiles = [];
		isOutdated = false;

		try {
			// Verify user is authenticated (more secure than getSession)
			const { data: userData, error: userError } = await supabase.auth.getUser();
			if (userError || !userData?.user) {
				console.warn('No authenticated user available for update check');
				return;
			}
			// Get session token after verifying user
			const { data: sessionData } = await supabase.auth.getSession();
			const token = sessionData?.session?.access_token;

			if (!token) {
				console.warn('No session token available for update check');
				return;
			}

			const res = await fetch('/api/docs/check-updates', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${token}`
				},
				body: JSON.stringify({
					submissionId: data.submission.id
				})
			});

			const result = await res.json().catch(() => ({}));
			if (res.ok && result.outdated) {
				isOutdated = true;
				outdatedFiles = result.changedFiles || [];
			}
		} catch (e) {
			console.error('Failed to check for updates:', e);
		} finally {
			checkingUpdates = false;
		}
	}

	// Regenerate documentation with latest code
	async function regenerateDocumentation() {
		regenerateErr = '';
		regenerateMsg = '';
		regenerating = true;

		try {
			// Get the authenticated user (more secure than getSession)
			const { data: userData, error: userError } = await supabase.auth.getUser();
			if (userError || !userData?.user) {
				throw new Error('No authenticated user available');
			}
			// Get session token after verifying user
			const { data: sessionData } = await supabase.auth.getSession();
			const token = sessionData?.session?.access_token;

			if (!token) {
				throw new Error('No session token available');
			}

			const res = await fetch('/api/docs/update', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${token}`
				},
				body: JSON.stringify({
					submissionId: data.submission.id
				})
			});

			const result = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(result?.error || result?.details || `Update failed (${res.status})`);
			}

			regenerateMsg = 'Documentation regenerated successfully! Refreshing...';
			// Refresh the page after a short delay to show the updated content
			setTimeout(() => {
				window.location.reload();
			}, 1500);
		} catch (e) {
			regenerateErr = String(e);
		} finally {
			regenerating = false;
		}
	}

	// Notion push functions
	async function openNotionModal() {
		notionModalOpen = true;
		notionPushMsg = '';
		notionPushErr = '';
		selectedNotionPageId = '';
		await loadNotionPages();
	}

	async function refreshNotionPages() {
		notionPushErr = '';
		await loadNotionPages();
	}

	async function loadNotionPages() {
		loadingNotionPages = true;
		try {
			const response = await fetch('/api/integrations/notion/pages');
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to load Notion pages');
			}
			const data = await response.json();
			notionPages = data.pages || [];
		} catch (err: any) {
			notionPushErr = err.message || 'Failed to load Notion pages';
		} finally {
			loadingNotionPages = false;
		}
	}

	async function pushToNotion() {
		if (!selectedNotionPageId) {
			notionPushErr = 'Please select a Notion page';
			return;
		}

		pushingToNotion = true;
		notionPushMsg = '';
		notionPushErr = '';

		try {
			const response = await fetch('/api/integrations/notion/push', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					submissionId: data.submission.id,
					pageId: selectedNotionPageId,
					title: title || 'Documentation',
					html: html, // Send HTML to preserve formatting
					markdown: markdown // Fallback
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || data.detail || 'Failed to push to Notion');
			}

			const result = await response.json();
			notionPushMsg = result.message || 'Successfully pushed to Notion!';
			
			// Close modal after a short delay
			setTimeout(() => {
				notionModalOpen = false;
			}, 2000);
		} catch (err: any) {
			notionPushErr = err.message || 'Failed to push to Notion';
		} finally {
			pushingToNotion = false;
		}
	}

	// Auto-check for updates when page loads (only for GitHub repos)
	onMount(() => {
		const isGitRepo =
			data.submission.input_type === 'github_repo' ||
			data.submission.input_type === 'github_repo_directory';
		if (isGitRepo && data.submission.status === 'completed') {
			checkForUpdates();
		}
	});
</script>

<!-- ------------------------------------------------------------
     MARKUP
     ------------------------------------------------------------ -->
<div class="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
	<div class="mx-auto w-full max-w-none space-y-6">
		<header>
			<h1 class="text-3xl font-bold text-white">Edit Documentation</h1>
			<p class="text-white/60">
				Submission ID: <span class="font-mono">{data.submission.id}</span>
			</p>
			<p class="text-white/60">
				Created: {new Date(data.submission.created_date).toLocaleString()}
			</p>
			{#if statusNotice}
				<div
					class="mt-2 rounded-xl border border-yellow-300/30 bg-yellow-500/10 px-3 py-2 text-yellow-200"
				>
					{statusNotice}
				</div>
			{/if}

			<!-- Outdated files banner -->
			{#if checkingUpdates}
				<div
					class="mt-2 flex items-center gap-2 rounded-xl border border-blue-300/30 bg-blue-500/10 px-3 py-2 text-blue-200"
				>
					<Loader2 class="h-4 w-4 animate-spin" />
					<span>Checking for updates...</span>
				</div>
			{:else if isOutdated && outdatedFiles.length > 0}
				<div
					class="mt-2 rounded-xl border border-orange-300/30 bg-orange-500/10 px-4 py-3 text-orange-200"
				>
					<div class="mb-2 flex items-center gap-2">
						<AlertCircle class="h-5 w-5" />
						<span class="font-semibold">Source files have changed</span>
					</div>
					<p class="mb-3 text-sm text-orange-200/80">
						{outdatedFiles.length} file{outdatedFiles.length === 1 ? '' : 's'} have been modified since
						this documentation was created:
					</p>
					<ul class="mb-3 ml-4 list-disc space-y-1 text-sm">
						{#each outdatedFiles as file}
							<li class="font-mono text-xs">{file.file_path}</li>
						{/each}
					</ul>
					<button
						class="inline-flex items-center gap-2 rounded-lg bg-orange-500/20 px-4 py-2 text-sm font-medium text-orange-200 hover:bg-orange-500/30 disabled:opacity-60"
						on:click|preventDefault={regenerateDocumentation}
						disabled={regenerating}
					>
						{#if regenerating}
							<Loader2 class="h-4 w-4 animate-spin" />
							<span>Regenerating...</span>
						{:else}
							<RefreshCw class="h-4 w-4" />
							<span>Regenerate Documentation</span>
						{/if}
					</button>
					{#if regenerateErr}
						<div class="mt-2 text-sm text-red-300">{regenerateErr}</div>
					{/if}
					{#if regenerateMsg}
						<div class="mt-2 text-sm text-green-300">{regenerateMsg}</div>
					{/if}
				</div>
			{:else if isGitRepo && data.submission.status === 'completed'}
				<!-- Fresh status indicator -->
				<div
					class="mt-2 flex items-center gap-2 rounded-xl border border-green-300/30 bg-green-500/10 px-3 py-2 text-green-200"
				>
					<CheckCircle2 class="h-4 w-4" />
					<span class="text-sm">Documentation is up to date</span>
					<button
						class="ml-auto inline-flex items-center gap-1 rounded-lg bg-green-500/20 px-3 py-1 text-xs font-medium text-green-200 hover:bg-green-500/30 disabled:opacity-60"
						on:click|preventDefault={checkForUpdates}
						disabled={checkingUpdates}
						title="Check for updates"
					>
						{#if checkingUpdates}
							<Loader2 class="h-3 w-3 animate-spin" />
							Checking...
						{:else}
							<RefreshCw class="h-3 w-3" />
							Check Now
						{/if}
					</button>
				</div>
			{/if}
		</header>

		<!-- Title input -->
		<label class="block">
			<div class="mb-1 text-sm text-white/70">Title</div>
			<input
				class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
				bind:value={title}
				placeholder="Untitled"
			/>
		</label>

		<!-- Side-by-side full-width layout (desktop-focused, true 50/50 without overflow) -->
		<div class="space-y-2">
			<div class="mb-1 text-sm text-white/70">Content</div>

			<!-- Center the workspace. overflow-x-hidden guards against rare subpixel overflow -->
			<div class="flex justify-center overflow-x-hidden">
				<div class="flex w-full max-w-[4000px] gap-8">
					<div class="h-[75vh] min-w-0 flex-1">
						<RichTextEditor
							initialHTML={String(initialHTML)}
							on:change={handleChange}
							on:cursor={handleCursor}
						/>
					</div>
					<div
						class="h-[75vh] min-w-0 flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-6 backdrop-blur-md"
						bind:this={previewPane}
					>
						<div class="mb-2 text-sm text-white/70">Live preview</div>
						<div
							class="prose prose-invert min-h-full max-w-none break-words text-white"
							on:click|stopPropagation
						>
							{@html html}
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Save controls -->
		<div class="flex items-center gap-3">
			<button
				class="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-2.5 text-white shadow hover:from-purple-600 hover:to-pink-600 disabled:opacity-60"
				on:click|preventDefault={saveChanges}
				disabled={saving}
			>
				{#if saving}
					<Loader2 class="h-4 w-4 animate-spin" />
					<span>Saving…</span>
				{:else}
					<span>Save</span>
				{/if}
			</button>

			<button
				class="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-white/80 hover:bg-white/10 disabled:opacity-60"
				on:click|preventDefault={openNotionModal}
				disabled={saving}
			>
				<FileText class="h-4 w-4" />
				<span>Push to Notion</span>
			</button>

			<a
				href="/edit"
				class="rounded-xl border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
			>
				Back to Edit
			</a>
		</div>

		<!-- Save messages -->
		{#if saveErr}
			<div class="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-red-200">
				{saveErr}
			</div>
		{/if}
		{#if saveMsg}
			<div class="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white/80">
				{saveMsg}
			</div>
		{/if}
	</div>
</div>

<!-- Notion Push Modal -->
{#if notionModalOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
		on:click={() => (notionModalOpen = false)}
		on:keydown={(e) => e.key === 'Escape' && (notionModalOpen = false)}
		role="dialog"
		aria-modal="true"
	>
		<div
			class="w-full max-w-lg rounded-xl border border-white/20 bg-black/90 p-6 shadow-xl backdrop-blur-md"
			on:click|stopPropagation
		>
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-xl font-semibold text-white">Push to Notion</h2>
				<button
					class="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
					on:click={() => (notionModalOpen = false)}
				>
					<X class="h-5 w-5" />
				</button>
			</div>
			<p class="mb-4 text-sm text-white/70">
				Select a Notion page to create a new child page with this documentation.
			</p>

			{#if loadingNotionPages}
				<div class="flex items-center justify-center py-8">
					<Loader2 class="h-6 w-6 animate-spin text-white/50" />
					<span class="ml-2 text-white/70">Loading pages...</span>
				</div>
			{:else if notionPages.length === 0}
				<div class="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-yellow-200">
					<p class="text-sm">
						No Notion pages found. Make sure you've shared pages with your integration.
					</p>
					<a
						href="/integrations"
						class="mt-2 inline-block text-sm underline"
					>
						Check your Notion connection
					</a>
				</div>
			{:else}
				<div class="mb-4">
					<div class="mb-2 flex items-center justify-between">
						<label class="block text-sm text-white/70">Select a page:</label>
						<button
							class="flex items-center gap-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
							on:click={refreshNotionPages}
							disabled={loadingNotionPages}
							title="Refresh pages list"
						>
							<RefreshCw class="h-3 w-3" />
							Refresh
						</button>
					</div>
					<select
						bind:value={selectedNotionPageId}
						class="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
					>
						<option value="">-- Select a page --</option>
						{#each notionPages as page}
							<option value={page.id}>
								{page.properties?.title?.title?.[0]?.plain_text || page.id}
							</option>
						{/each}
					</select>
				</div>
			{/if}

			{#if notionPushErr}
				<div class="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-200">
					{notionPushErr}
				</div>
			{/if}

			{#if notionPushMsg}
				<div class="mb-4 rounded-lg border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-200">
					{notionPushMsg}
				</div>
			{/if}

			<div class="flex justify-end gap-3">
				<button
					class="rounded-lg border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
					on:click={() => (notionModalOpen = false)}
				>
					Cancel
				</button>
				<button
					class="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
					on:click|preventDefault={pushToNotion}
					disabled={!selectedNotionPageId || pushingToNotion || loadingNotionPages}
				>
					{#if pushingToNotion}
						<span class="flex items-center gap-2">
							<Loader2 class="h-4 w-4 animate-spin" />
							Pushing...
						</span>
					{:else}
						Push to Notion
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
