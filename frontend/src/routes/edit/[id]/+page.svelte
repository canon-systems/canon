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

	// 4) Bring in Supabase + icons
	import { supabase } from '$lib/supabaseClient';
	import { Loader2 } from '@lucide/svelte';

	// 5) Bring in our rich editor component
	import RichTextEditor from '$lib/components/RichTextEditor.svelte';

	// 6) Converters
	// marked: Markdown -> HTML for TipTap initial content
	import { marked } from 'marked';
	// turndown: HTML -> Markdown when saving
	import TurndownService from 'turndown';
	const turndown = new TurndownService();

	// 7) Make initial HTML for the editor from the DB markdown
	//    If empty, provide a simple paragraph so the canvas is clickable.
	let initialHTML = (markdown && marked.parse(markdown)) || '<p></p>';

	// 8) Live HTML coming from the editor (we keep it in sync and convert on save)
	let html = String(initialHTML);

	// 9) Status hint
	$: statusNotice =
		data.submission.status === 'processing'
			? 'Note: This submission is still processing.'
			: data.submission.error_message
				? `Last run failed: ${data.submission.error_message}`
				: '';

	// 10) Receive change events from the editor and update our html + markdown
	function handleChange(e: CustomEvent<{ html: string }>) {
		html = e.detail.html;
		// keep the canonical markdown up to date, so Save uses latest value
		markdown = turndown.turndown(html);
	}

	// 11) Save handler: write title/markdown back to Supabase (unchanged table shape)
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

			<a
				href="/history"
				class="rounded-xl border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
			>
				Back to History
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
