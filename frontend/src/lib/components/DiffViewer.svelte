<script lang="ts">
	import { computeTextDiff, diffToHtml } from '$lib/utils/textDiff';
	import { marked } from 'marked';
	import { onMount } from 'svelte';

	export let originalText: string = '';
	export let newText: string = '';
	export let showMarkdown: boolean = true; // Whether to render as markdown or plain text

	let diffHtml = '';
	let showGitDiff = false;
	let gitDiffContent = '';
	let loadingGitDiff = false;
	let gitDiffError = '';

	// Compute diff on mount and when texts change
	$: {
		if (originalText && newText) {
			// Compare markdown directly (better for diff visualization)
			const segments = computeTextDiff(originalText, newText);
			diffHtml = diffToHtml(segments);
		} else {
			diffHtml = '';
		}
	}

	// Function to fetch Git diff (will be called from parent)
	export async function fetchGitDiff(repoUrl: string, branch: string, filePath: string, oldCommitSha?: string) {
		loadingGitDiff = true;
		gitDiffError = '';
		gitDiffContent = '';

		try {
			const res = await fetch('/api/github/diff', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					repoUrl,
					branch,
					filePath,
					oldCommitSha
				})
			});

			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(data?.error || 'Failed to fetch Git diff');
			}

			gitDiffContent = data.diff || '';
			showGitDiff = true; // Automatically switch to Git diff view when content is loaded
		} catch (err) {
			gitDiffError = String(err);
		} finally {
			loadingGitDiff = false;
		}
	}
</script>

<div class="space-y-4">
	<!-- Toggle between diff view and Git diff -->
	<div class="flex items-center gap-2">
		<button
			class="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors {!showGitDiff
				? 'border-purple-400/50 bg-purple-500/20 text-purple-300'
				: 'border-white/20 bg-white/5 text-white/70 hover:bg-white/10'}"
			on:click={() => (showGitDiff = false)}
		>
			Content Diff
		</button>
		<button
			class="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors {showGitDiff
				? 'border-purple-400/50 bg-purple-500/20 text-purple-300'
				: 'border-white/20 bg-white/5 text-white/70 hover:bg-white/10'}"
			on:click={() => (showGitDiff = true)}
		>
			Git Diff
		</button>
	</div>

	{#if !showGitDiff}
		<!-- Content Diff View -->
		<div class="grid grid-cols-2 gap-4">
			<!-- Original -->
			<div>
				<div class="mb-2 text-sm font-medium text-white/70">Original Documentation</div>
				<div class="h-[60vh] overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-4">
					{#if showMarkdown}
						<div class="prose prose-invert max-w-none text-white text-sm">
							{@html (originalText && marked.parse(originalText)) || '<p class="text-white/50">No content</p>'}
						</div>
					{:else}
						<pre class="whitespace-pre-wrap text-xs text-white/90 font-mono">{originalText || 'No content'}</pre>
					{/if}
				</div>
			</div>

			<!-- New with highlights -->
			<div>
				<div class="mb-2 text-sm font-medium text-white/70">Updated Documentation (with diff highlights)</div>
				<div class="h-[60vh] overflow-y-auto rounded-lg border border-green-500/30 bg-green-500/5 p-4">
					{#if showMarkdown}
						<div class="prose prose-invert max-w-none text-white text-sm">
							{@html (diffHtml && marked.parse(diffHtml)) || '<p class="text-white/50">No content</p>'}
						</div>
					{:else}
						<pre class="whitespace-pre-wrap text-xs text-white/90 font-mono">{@html diffHtml || 'No content'}</pre>
					{/if}
				</div>
			</div>
		</div>
	{:else}
		<!-- Git Diff View -->
		<div>
			<div class="mb-2 text-sm font-medium text-white/70">Git Diff</div>
			{#if loadingGitDiff}
				<div class="flex items-center justify-center py-8">
					<div class="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/60"></div>
					<span class="ml-2 text-white/70">Loading diff...</span>
				</div>
			{:else if gitDiffError}
				<div class="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-200">
					{gitDiffError}
				</div>
			{:else if gitDiffContent}
				<div class="h-[60vh] overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-4">
					<pre class="whitespace-pre-wrap text-xs font-mono text-white/90"><code class="diff-content">{gitDiffContent}</code></pre>
				</div>
			{:else}
				<div class="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm text-yellow-200">
					Click on a file's "View Diff" button to see the Git diff
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	:global(.diff-added) {
		background-color: rgba(34, 197, 94, 0.2);
		color: rgb(134, 239, 172);
		padding: 2px 4px;
		border-radius: 3px;
	}

	:global(.diff-deleted) {
		background-color: rgba(239, 68, 68, 0.2);
		color: rgb(252, 165, 165);
		text-decoration: line-through;
		padding: 2px 4px;
		border-radius: 3px;
	}

	:global(.diff-content) {
		display: block;
		line-height: 1.5;
	}

	:global(.diff-content .diff-line-added) {
		background-color: rgba(34, 197, 94, 0.1);
		color: rgb(134, 239, 172);
	}

	:global(.diff-content .diff-line-deleted) {
		background-color: rgba(239, 68, 68, 0.1);
		color: rgb(252, 165, 165);
	}

	:global(.diff-content .diff-line-header) {
		color: rgb(147, 197, 253);
		font-weight: 600;
	}
</style>

